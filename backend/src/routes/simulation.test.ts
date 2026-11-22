import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { createPanelAuth } from '../auth/panelAuth.js';
import { emptyCareData, type Person } from '../care/document.js';
import type { CareStore } from '../care/store.js';
import { caseMessages, pickSimulationCase, SIMULATION_MESSAGE_GAP_MS } from '../services/simulation.js';
import { SIMULATION_CASES } from '../services/simulationCases.js';
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

const CONTACTS = [
  { id: 'a', name: 'Ana', relation: 'Hija', phone: '300 111' },
  { id: 'b', name: 'Sin teléfono', relation: '', phone: ' ' },
  { id: 'c', name: 'Carlos', relation: '', phone: '300 222' },
];

describe('Soliker Bot cases', () => {
  test('12 cases with the specified ids, categories and weights', () => {
    assert.deepEqual(SIMULATION_CASES.map((item) => item.id), Array.from({ length: 12 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`));
    const weight = (category: string) => SIMULATION_CASES.filter((item) => item.category === category).reduce((total, item) => total + item.weight, 0);
    assert.equal(weight('caida'), 80);
    assert.equal(weight('ausencia'), 20);
    assert.deepEqual(SIMULATION_CASES.filter((item) => item.category === 'ausencia').map((item) => item.id), ['C10', 'C11', 'C12']);
  });

  test('the draw follows the weights and never leaves the category', () => {
    assert.equal(pickSimulationCase('caida', () => 0).id, 'C01');
    assert.equal(pickSimulationCase('caida', () => 0.999).id, 'C09');
    assert.equal(pickSimulationCase('ausencia', () => 0).id, 'C10');
    assert.equal(pickSimulationCase('ausencia', () => 7.5 / 20).id, 'C11');
    assert.equal(pickSimulationCase('ausencia', () => 0.999).id, 'C12');
  });

  for (const item of SIMULATION_CASES) {
    test(`${item.id}: demo notice first, closing last, ordered time, no loose placeholder, 123 labelled`, () => {
      const steps = caseMessages(item, person('p1', { contacts: CONTACTS }), AT);
      assert.match(steps[0].text, new RegExp(`MODO DEMO – simulación, no se envía nada real\\. Caso #${item.id}`));
      assert.match(steps.at(-1)!.text, new RegExp(`Registro\\nCaso: #${item.id}`));
      assert.ok(steps.some((step) => step.text.includes(`Caso #${item.id} cerrado. Estado final: `)));
      assert.ok(steps.length <= 37, 'stays within 120 s, the longest duration the panel accepts');
      steps.forEach((step, index) => assert.equal(step.delayMs, index * SIMULATION_MESSAGE_GAP_MS));
      const times = steps.map((step) => /\[T\+(\d\d:\d\d)\]/.exec(step.text)![1]);
      for (const step of steps) assert.doesNotMatch(step.text, /\{\w+\}/);
      assert.deepEqual(times, [...times].sort(), 'simulated time never goes back');
      for (const step of steps.filter((candidate) => candidate.text.includes('Línea 123'))) assert.match(step.text, /\(SIMULADO\)/);
    });
  }

  test('uses the panel person and contacts, and completes missing contacts with the defaults', () => {
    const text = caseMessages(SIMULATION_CASES[4], person('p1', { contacts: CONTACTS }), AT).map((step) => step.text).join('\n');
    assert.match(text, /Posible caída detectada – Rosa Pérez – en casa/);
    assert.match(text, /Enviando alerta simultánea a 3 contactos: Ana \(Hija\), Carlos, Laura \(hija\)\./);
    assert.doesNotMatch(text, /Don Jorge|Sin teléfono/);
  });

  test('cases without contact involvement send them no final update', () => {
    for (const id of ['C01', 'C12']) {
      const item = SIMULATION_CASES.find((candidate) => candidate.id === id)!;
      assert.ok(!caseMessages(item, person('p1'), AT).some((step) => step.text.includes('Actualización final')));
    }
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
      random: () => 0,
    });
  };
  const start = (personId: unknown, headers: Record<string, string> = KEY, path = 'fall') =>
    app.inject({ method: 'POST', url: `/api/v1/simulation/${path}`, headers, payload: { personId } });
  const runTasks = async () => {
    while (tasks.length > 0) {
      const batch = tasks.sort((a, b) => a.delayMs - b.delayMs);
      tasks = [];
      for (const { task } of batch) task();
      await new Promise((resolve) => setImmediate(resolve));
    }
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
    for (const path of ['fall', 'away']) {
      assert.equal((await start('p1', {}, path)).statusCode, 401);
      assert.equal((await start(42, KEY, path)).statusCode, 400);
      assert.equal((await start('nobody', KEY, path)).statusCode, 404);
      assert.equal((await start('p2', KEY, path)).statusCode, 404);
    }
    assert.deepEqual(sent, []);
  });

  test('each button plays a case of its category, all messages in order', async () => {
    await build();
    const fall = await start('p1');
    assert.equal(fall.statusCode, 200);
    assert.equal(fall.json().caseId, 'C01');
    assert.equal(fall.json().telegram, 'enviado');
    assert.equal(sent.length, 1);
    assert.match(sent[0], /MODO DEMO/);
    await runTasks();
    const expected = caseMessages(SIMULATION_CASES[0], person('p1', { contacts: [{ id: 'a', name: 'Ana', relation: 'Hija', phone: '300' }] }), AT).map((step) => step.text);
    assert.deepEqual(sent, expected);

    sent = [];
    const away = await start('p1', KEY, 'away');
    assert.equal(away.json().caseId, 'C10');
    await runTasks();
    assert.match(sent.at(-1)!, /Caso: #C10/);
  });

  test('one simulation at a time across both buttons: 409 until it ends', async () => {
    await build();
    const first = await start('p1');
    assert.equal(first.statusCode, 200);
    clock += 1_000;
    const busy = await start('p1', KEY, 'away');
    assert.equal(busy.statusCode, 409);
    assert.equal(busy.json().remainingMs, first.json().durationMs - 1_000);
    await runTasks();
    assert.equal((await start('p1')).statusCode, 200);
  });

  test('a message that fails does not stop the following ones', async () => {
    await build();
    await start('p1');
    failSend = true;
    tasks.shift()!.task();
    await new Promise((resolve) => setImmediate(resolve));
    failSend = false;
    await runTasks();
    assert.match(sent.at(-1)!, /Registro/);
  });

  test('without Telegram the simulation still starts; a failed first message is reported and stops the rest', async () => {
    await build(false);
    const offline = (await start('p1')).json();
    assert.equal(offline.telegram, 'sin-configurar');
    assert.ok(offline.durationMs > 0);
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
