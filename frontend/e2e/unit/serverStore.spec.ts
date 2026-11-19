import { expect, test } from '@playwright/test';
import { CareStoreError, createServerCareRepository, MAX_CONFLICT_RETRIES } from '../../src/data/serverStore';
import { emptyCareData, StoreValidationError } from '../../src/data/store';
import type { CareData } from '../../src/data/types';

const API = 'http://api.test';

/** A stand-in for the backend: the same compare-and-set rule as PUT /api/v1/care, plus switches to make it misbehave. */
function fakeServer() {
  const server = {
    version: 0,
    data: emptyCareData() as CareData,
    puts: [] as { baseVersion: number; data: CareData }[],
    /** Called before each PUT is answered; use it to let "another panel" write first. */
    beforePut: null as null | (() => void),
    status: null as number | null,
    fail: false,
    fetch: (async (url: string, init?: RequestInit) => {
      if (server.fail) throw new TypeError('Failed to fetch');
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (server.status) return json(server.status, { error: 'x' });
      if (!init?.method || init.method === 'GET') return json(200, { version: server.version, data: server.data });
      const body = JSON.parse(String(init.body)) as { baseVersion: number; data: CareData };
      server.puts.push(body);
      server.beforePut?.();
      if (body.baseVersion !== server.version) return json(409, { error: 'Conflict', version: server.version, data: server.data });
      server.version += 1;
      server.data = body.data;
      return json(200, { version: server.version, data: server.data });
    }) as typeof fetch,
    otherPanelAddsPerson(name: string) {
      server.version += 1;
      server.data = { ...server.data, people: [...server.data.people, { id: `other-${server.version}`, name, relation: '', deviceId: null, contacts: [], createdAt: '2026-01-01T00:00:00.000Z' }] };
    },
  };
  return server;
}

test.describe('server care repository', () => {
  let server: ReturnType<typeof fakeServer>;
  let unauthorized = 0;
  const original = globalThis.fetch;

  test.beforeEach(() => {
    server = fakeServer();
    unauthorized = 0;
    globalThis.fetch = (input, init) => server.fetch(input as string, init);
  });
  test.afterEach(() => {
    globalThis.fetch = original;
  });

  const create = (initial = true) =>
    createServerCareRepository({
      apiUrl: API,
      getKey: () => 'clave',
      initial: initial ? { version: server.version, data: server.data } : undefined,
      onUnauthorized: () => {
        unauthorized += 1;
      },
    });

  test('a change is written with the version it was based on and the snapshot takes the server answer', async () => {
    const repository = create();
    const person = await repository.addPerson({ name: 'Ana', relation: 'Mamá', deviceId: 'dev-1' });
    expect(server.puts).toHaveLength(1);
    expect(server.puts[0].baseVersion).toBe(0);
    expect(server.version).toBe(1);
    expect(repository.getSnapshot().people).toEqual([person]);
  });

  test('on a conflict the change is applied again to the document the server returned', async () => {
    const repository = create();
    server.beforePut = () => {
      server.beforePut = null;
      server.otherPanelAddsPerson('Otra persona');
    };
    const person = await repository.addPerson({ name: 'Ana', relation: '', deviceId: null });
    expect(server.puts.map((put) => put.baseVersion)).toEqual([0, 1]);
    expect(server.data.people.map((p) => p.name)).toEqual(['Otra persona', 'Ana']);
    expect(server.data.people[1].id).toBe(person.id);
    expect(repository.getSnapshot().people).toHaveLength(2);
  });

  test('a retried change that is no longer allowed is refused instead of overwriting', async () => {
    const repository = create();
    server.beforePut = () => {
      server.beforePut = null;
      server.version += 1;
      server.data = { ...server.data, people: [{ id: 'x', name: 'Rosa', relation: '', deviceId: 'dev-1', contacts: [], createdAt: '2026-01-01T00:00:00.000Z' }] };
    };
    await expect(repository.addPerson({ name: 'Ana', relation: '', deviceId: 'dev-1' })).rejects.toBeInstanceOf(StoreValidationError);
    expect(server.data.people.map((p) => p.name)).toEqual(['Rosa']);
    expect(repository.getSnapshot().people.map((p) => p.name)).toEqual(['Rosa']);
  });

  test('gives up after the bounded number of retries and says so', async () => {
    const repository = create();
    const messages: string[] = [];
    repository.subscribeErrors((message) => messages.push(message));
    server.beforePut = () => server.otherPanelAddsPerson('Otra');
    const error = await repository.addPerson({ name: 'Ana', relation: '', deviceId: null }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CareStoreError);
    expect(server.puts).toHaveLength(MAX_CONFLICT_RETRIES + 1);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/otro panel/i);
  });

  test('a validation error is not sent to the server and does not raise a storage toast', async () => {
    const repository = create();
    const messages: string[] = [];
    repository.subscribeErrors((message) => messages.push(message));
    await expect(repository.addPerson({ name: '  ', relation: '', deviceId: null })).rejects.toBeInstanceOf(StoreValidationError);
    expect(server.puts).toHaveLength(0);
    expect(messages).toEqual([]);
  });

  test('an operation that changes nothing writes nothing', async () => {
    const repository = create();
    await repository.recordAlertEvents([]);
    await repository.assignDevice('dev-1', null);
    expect(server.puts).toHaveLength(0);
  });

  test('a 401 on a write asks for the key again and the change is not kept', async () => {
    const repository = create();
    server.status = 401;
    await expect(repository.addPerson({ name: 'Ana', relation: '', deviceId: null })).rejects.toBeInstanceOf(CareStoreError);
    expect(unauthorized).toBe(1);
    expect(repository.getSnapshot().people).toEqual([]);
  });

  test('writes made at the same time are applied one after the other, none lost', async () => {
    const repository = create();
    await Promise.all([1, 2, 3, 4].map((n) => repository.addPerson({ name: `P${n}`, relation: '', deviceId: null })));
    expect(server.data.people.map((p) => p.name)).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(server.puts.map((put) => put.baseVersion)).toEqual([0, 1, 2, 3]);
  });

  test('a silent write (the alert journal) failing does not announce anything', async () => {
    const repository = create();
    const messages: string[] = [];
    repository.subscribeErrors((message) => messages.push(message));
    server.fail = true;
    await expect(
      repository.recordAlertEvents([{ id: 'j', kind: 'caida', deviceId: 'd', at: '2026-01-01T00:00:00.000Z', detectedAt: '2026-01-01T00:00:00.000Z' }]),
    ).rejects.toBeInstanceOf(CareStoreError);
    expect(messages).toEqual([]);
  });

  test('refresh brings in another panel\'s change, notifies, and does nothing when the version is the same', async () => {
    const repository = create();
    let notified = 0;
    repository.subscribe(() => (notified += 1));
    await repository.refresh();
    expect(notified).toBe(0);
    server.otherPanelAddsPerson('Nueva');
    await repository.refresh();
    expect(notified).toBe(1);
    expect(repository.getSnapshot().people.map((p) => p.name)).toEqual(['Nueva']);
    expect(repository.getVersion()).toBe(1);
  });

  test('started unloaded (the server was down), the first write waits for a successful read, then builds on it', async () => {
    server.otherPanelAddsPerson('Existente');
    const repository = create(false);
    server.fail = true;
    await expect(repository.addPerson({ name: 'Ana', relation: '', deviceId: null })).rejects.toBeInstanceOf(CareStoreError);
    expect(server.puts).toHaveLength(0);
    server.fail = false;
    await repository.addPerson({ name: 'Ana', relation: '', deviceId: null });
    expect(server.data.people.map((p) => p.name)).toEqual(['Existente', 'Ana']);
  });

  test('importLocal merges into the current server document and reports what it did', async () => {
    const repository = create();
    const local: CareData = { ...emptyCareData(), people: [{ id: 'l1', name: 'Local', relation: '', deviceId: 'dev-1', contacts: [], createdAt: '2026-01-01T00:00:00.000Z' }] };
    const report = await repository.importLocal(local);
    expect(report).toMatchObject({ peopleAdded: 1, changed: true });
    expect(server.data.people.map((p) => p.id)).toEqual(['l1']);
    // Importing again changes nothing and writes nothing.
    const again = await repository.importLocal(local);
    expect(again.changed).toBe(false);
    expect(server.puts).toHaveLength(1);
  });
});
