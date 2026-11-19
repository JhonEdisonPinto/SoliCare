import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { createPanelAuth } from '../auth/panelAuth.js';
import { corsOptions } from '../config/cors.js';
import { emptyCareData, type CareData } from '../care/document.js';
import type { CareStore, StoredCare } from '../care/store.js';
import { registerCareRoutes } from './care.js';

/** In-memory store with the same compare-and-set behaviour as the PostgreSQL one. */
function memoryStore(): CareStore & { current: StoredCare | null } {
  const store: CareStore & { current: StoredCare | null } = {
    current: null,
    async get() {
      return store.current;
    },
    async replace(baseVersion, data) {
      const version = store.current?.version ?? 0;
      if (version !== baseVersion) return { ok: false, current: store.current ?? { version: 0, data: emptyCareData() } };
      store.current = { version: version + 1, data };
      return { ok: true, version: version + 1 };
    },
  };
  return store;
}

const KEY = { authorization: 'Bearer panel-key' };
const withPerson = (name: string): CareData => ({
  ...emptyCareData(),
  people: [{ id: 'p1', name, relation: '', deviceId: null, contacts: [], createdAt: '2026-01-01T00:00:00.000Z' }],
});

describe('care routes', () => {
  let app: FastifyInstance;
  let store: ReturnType<typeof memoryStore>;

  beforeEach(async () => {
    store = memoryStore();
    app = Fastify();
    await app.register(cors, corsOptions('https://panel.example'));
    await registerCareRoutes(app, { store, isAuthorized: createPanelAuth({ panelToken: 'panel-key', nodeEnv: 'production' }) });
  });
  afterEach(() => app.close());

  test('GET returns version 0 and an empty document when nothing is stored', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/care', headers: KEY });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { version: 0, data: emptyCareData() });
  });

  test('both routes answer 401 without the key or with a wrong one', async () => {
    for (const headers of [{}, { authorization: 'Bearer nope' }]) {
      assert.equal((await app.inject({ method: 'GET', url: '/api/v1/care', headers })).statusCode, 401);
      assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/care', headers, payload: { baseVersion: 0, data: emptyCareData() } })).statusCode, 401);
    }
    assert.equal(store.current, null);
  });

  test('PUT with the stored version stores the document and bumps the version', async () => {
    const first = await app.inject({ method: 'PUT', url: '/api/v1/care', headers: KEY, payload: { baseVersion: 0, data: withPerson('Ana') } });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().version, 1);
    const second = await app.inject({ method: 'PUT', url: '/api/v1/care', headers: KEY, payload: { baseVersion: 1, data: withPerson('Ana María') } });
    assert.equal(second.json().version, 2);
    const read = await app.inject({ method: 'GET', url: '/api/v1/care', headers: KEY });
    assert.equal(read.json().version, 2);
    assert.equal(read.json().data.people[0].name, 'Ana María');
  });

  test('a stale baseVersion answers 409 with the current document and changes nothing', async () => {
    await app.inject({ method: 'PUT', url: '/api/v1/care', headers: KEY, payload: { baseVersion: 0, data: withPerson('Ana') } });
    for (const baseVersion of [0, 5]) {
      const stale = await app.inject({ method: 'PUT', url: '/api/v1/care', headers: KEY, payload: { baseVersion, data: withPerson('Intruso') } });
      assert.equal(stale.statusCode, 409);
      const body = stale.json();
      assert.equal(body.error, 'Conflict');
      assert.equal(body.version, 1);
      assert.equal(body.data.people[0].name, 'Ana');
    }
    assert.equal(store.current?.data.people[0].name, 'Ana');
  });

  test('two writers on the same version: one wins, the other gets a conflict', async () => {
    const [a, b] = await Promise.all([
      app.inject({ method: 'PUT', url: '/api/v1/care', headers: KEY, payload: { baseVersion: 0, data: withPerson('A') } }),
      app.inject({ method: 'PUT', url: '/api/v1/care', headers: KEY, payload: { baseVersion: 0, data: withPerson('B') } }),
    ]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  });

  test('PUT rejects malformed payloads and documents with 400', async () => {
    const bad = [
      { payload: 'x', type: 'text/plain' },
      { payload: { data: emptyCareData() } },
      { payload: { baseVersion: -1, data: emptyCareData() } },
      { payload: { baseVersion: 1.5, data: emptyCareData() } },
      { payload: { baseVersion: '0', data: emptyCareData() } },
      { payload: { baseVersion: 0 } },
      { payload: { baseVersion: 0, data: { version: 2 } } },
      { payload: { baseVersion: 0, data: [] } },
    ];
    for (const { payload, type } of bad) {
      const response = await app.inject({ method: 'PUT', url: '/api/v1/care', headers: type ? { ...KEY, 'content-type': type } : KEY, payload });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
    }
    assert.equal(store.current, null);
  });

  test('PUT stores the normalized document, not the raw one', async () => {
    const raw = { ...emptyCareData(), people: [{ id: 'a', name: 'Ana', deviceId: 7, extra: 'dropped' }] };
    const response = await app.inject({ method: 'PUT', url: '/api/v1/care', headers: KEY, payload: { baseVersion: 0, data: raw } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().data.people[0], { id: 'a', name: 'Ana', relation: '', deviceId: null, contacts: [], createdAt: new Date(0).toISOString() });
  });

  test('PUT over the body limit is refused with 413', async () => {
    const huge = { ...emptyCareData(), people: [{ id: 'a', name: 'x'.repeat(1024 * 1024 + 10) }] };
    const response = await app.inject({ method: 'PUT', url: '/api/v1/care', headers: KEY, payload: { baseVersion: 0, data: huge } });
    assert.equal(response.statusCode, 413);
  });

  test('CORS preflight allows PUT with the Authorization header from the panel origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/care',
      headers: { origin: 'https://panel.example', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'authorization,content-type' },
    });
    assert.equal(response.statusCode, 204);
    assert.match(String(response.headers['access-control-allow-methods']), /PUT/);
    assert.match(String(response.headers['access-control-allow-headers']), /authorization/i);
    assert.equal(response.headers['access-control-allow-origin'], 'https://panel.example');
  });
});

describe('care routes without any token configured', () => {
  async function build(nodeEnv: string) {
    const app = Fastify();
    await registerCareRoutes(app, { store: memoryStore(), isAuthorized: createPanelAuth({ nodeEnv }) });
    return app;
  }

  test('development lets the request through, production refuses it', async () => {
    const dev = await build('development');
    assert.equal((await dev.inject({ method: 'GET', url: '/api/v1/care' })).statusCode, 200);
    await dev.close();
    const production = await build('production');
    assert.equal((await production.inject({ method: 'GET', url: '/api/v1/care' })).statusCode, 401);
    await production.close();
  });
});
