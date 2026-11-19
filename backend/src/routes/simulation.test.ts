import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { createPanelAuth } from '../auth/panelAuth.js';
import { emptyCareData, type Person } from '../care/document.js';
import type { CareStore } from '../care/store.js';
import { SIMULATION_DURATION_MS, simulationMessages } from '../services/simulation.js';
import { createTelegramNotify } from '../services/telegram.js';
import { registerSimulationRoutes } from './simulation.js';

const KEY = { authorization: 'Bearer panel-key' };
const AT = new Date('2026-11-19T15:03:00.000Z');

const person = (id: string, overrides: Partial<Person> = {}): Person => ({
  id,
  name: 'Rosa Pérez',
  relation: 'Mamá',
  deviceId: 'esp32-01',
  contacts: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const storeWith = (people: Person[]): CareStore => ({
  async get() {
    return { version: 1, data: { ...emptyCareData(), people } };
  },
  async replace() {
    throw new Error('the simulation must not write');
  },
});

describe('simulationMessages', () => {
  test('fall notice, one call per contact with a phone (max 3), then the closing message', () => {
    const contacts = [
      { id: 'a', name: 'Ana', relation: 'Hija', phone: '300 111' },
      { id: 'b', name: 'Sin teléfono', relation: '', phone: ' ' },
      { id: 'c', name: 'Carlos', relation: '', phone: '300 222' },
      { id: 'd', name: 'Diana', relation: 'Vecina', phone: '300 333' },
      { id: 'e', name: 'Eva', relation: '', phone: '300 444' },
    ];
    const steps = simulationMessages(person('p1', { contacts }), AT);
    assert.equal(steps.length, 5);
    assert.match(steps[0].text, /^🚨 \[SIMULACIÓN\] Caída detectada\n👤 Rosa Pérez \(Mamá\)\n📟 Dispositivo esp32-01\n🕒 10:03/);
    assert.deepEqual(
      steps.slice(1, 4).map((step) => step.text.split('\n').slice(0, 2)),
      [
        ['📞 [LLAMADA ENTRANTE]', 'Para: Ana (Hija) · 300 111'],
        ['📞 [LLAMADA ENTRANTE]', 'Para: Carlos · 300 222'],
        ['📞 [LLAMADA ENTRANTE]', 'Para: Diana (Vecina) · 300 333'],
      ],
    );
    assert.equal(steps[4].text, '✅ [SIMULACIÓN] Rosa Pérez está bien. Fin de la simulación.');
    assert.equal(steps[4].delayMs, SIMULATION_DURATION_MS);
    const delays = steps.map((step) => step.delayMs);
    assert.deepEqual(delays, [...delays].sort((a, b) => a - b));
  });

  test('without contacts the call goes to the monitoring centre', () => {
    const steps = simulationMessages(person('p1'), AT);
    assert.equal(steps.length, 3);
    assert.match(steps[1].text, /Para: Central de monitoreo SoliCare/);
  });
});

describe('simulation route', () => {
  let app: FastifyInstance;
  let sent: string[];
  let tasks: { task: () => void; delayMs: number }[];
  let clock: number;
  let failSend: boolean;

  const build = async (notifyConfigured = true) => {
    app = Fastify();
    await registerSimulationRoutes(app, {
      store: storeWith([person('p1', { contacts: [{ id: 'a', name: 'Ana', relation: 'Hija', phone: '300' }] }), person('p2', { deviceId: null })]),
      isAuthorized: createPanelAuth({ panelToken: 'panel-key' }),
      notify: notifyConfigured
        ? async (text) => {
            if (failSend) throw new Error('nope');
            sent.push(text);
          }
        : null,
      schedule: (task, delayMs) => void tasks.push({ task, delayMs }),
      now: () => new Date(clock),
    });
  };
  const start = (personId: unknown, headers: Record<string, string> = KEY) =>
    app.inject({ method: 'POST', url: '/api/v1/simulation/fall', headers, payload: { personId } });
  const runTasks = async () => {
    for (const { task } of tasks.sort((a, b) => a.delayMs - b.delayMs)) task();
    tasks = [];
    await new Promise((resolve) => setImmediate(resolve));
  };

  beforeEach(() => {
    sent = [];
    tasks = [];
    clock = AT.getTime();
    failSend = false;
  });
  afterEach(() => app?.close());

  test('401 without the panel key, 400 without a person id, 404 for an unknown person or one without a device', async () => {
    await build();
    assert.equal((await start('p1', {})).statusCode, 401);
    assert.equal((await start(42)).statusCode, 400);
    assert.equal((await start('nobody')).statusCode, 404);
    assert.equal((await start('p2')).statusCode, 404);
    assert.deepEqual(sent, []);
  });

  test('sends the fall notice at once and the rest on schedule, in order', async () => {
    await build();
    const response = await start('p1');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { durationMs: SIMULATION_DURATION_MS, telegram: 'enviado' });
    assert.equal(sent.length, 1);
    assert.match(sent[0], /Caída detectada/);
    await runTasks();
    assert.equal(sent.length, 3);
    assert.match(sent[1], /^📞 \[LLAMADA ENTRANTE\]\nPara: Ana \(Hija\) · 300/);
    assert.match(sent[2], /está bien/);
  });

  test('one simulation at a time: 409 until it ends', async () => {
    await build();
    assert.equal((await start('p1')).statusCode, 200);
    clock += 1_000;
    const busy = await start('p1');
    assert.equal(busy.statusCode, 409);
    assert.equal(busy.json().remainingMs, SIMULATION_DURATION_MS - 1_000);
    await runTasks();
    assert.equal((await start('p1')).statusCode, 200);
  });

  test('without Telegram the simulation still starts; a failed first message is reported and stops the rest', async () => {
    await build(false);
    assert.deepEqual((await start('p1')).json(), { durationMs: SIMULATION_DURATION_MS, telegram: 'sin-configurar' });
    await app.close();
    tasks = [];
    await build();
    failSend = true;
    assert.equal((await start('p1')).json().telegram, 'error');
    failSend = false;
    await runTasks();
    assert.deepEqual(sent, []);
  });
});

describe('createTelegramNotify', () => {
  test('null unless both the token and the chat id are set', () => {
    assert.equal(createTelegramNotify({}), null);
    assert.equal(createTelegramNotify({ botToken: 't' }), null);
    assert.equal(createTelegramNotify({ chatId: '-1' }), null);
  });

  test('posts the text to sendMessage and keeps the token out of errors', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const okFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    await createTelegramNotify({ botToken: 'SECRET', chatId: '-100' }, okFetch)!('hola');
    assert.deepEqual(calls, [{ url: 'https://api.telegram.org/botSECRET/sendMessage', body: { chat_id: '-100', text: 'hola' } }]);

    const badFetch = (async () => new Response('{"ok":false,"description":"chat not found"}', { status: 400 })) as unknown as typeof fetch;
    await assert.rejects(createTelegramNotify({ botToken: 'SECRET', chatId: '-1' }, badFetch)!('x'), (error: Error) => !error.message.includes('SECRET') && error.message.includes('400'));
    const downFetch = (async () => {
      throw new TypeError('fetch failed https://api.telegram.org/botSECRET/sendMessage');
    }) as unknown as typeof fetch;
    await assert.rejects(createTelegramNotify({ botToken: 'SECRET', chatId: '-1' }, downFetch)!('x'), (error: Error) => !error.message.includes('SECRET'));
  });
});
