import type { Person } from '../care/document.js';
import { SIMULATION_CASES, SIMULATION_DEFAULTS, type Actor, type ScriptStep, type SimulationCase, type SimulationCategory, type StepType } from './simulationCases.js';

/** Start-to-start gap between messages. Telegram allows a bot 20 messages per minute in a group. */
export const SIMULATION_MESSAGE_GAP_MS = 3_200;

export type SimulationStep = { delayMs: number; text: string };

const clock = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
const HOUR_MS = 3_600_000;

const ICON: Record<StepType, string> = { ESTADO: '📋', ENVIO: '📤', LLAMADA: '📞', RESPUESTA: '💬', TIMER: '⏱️', CIERRE: '✅' };

const withRelation = (name: string, relation: string) => (relation.trim() ? `${name} (${relation.trim()})` : name);
const firstWord = (name: string) => name.trim().split(/\s+/)[0].toLocaleLowerCase('es');

/** Draws one case of the category according to the weights. */
export function pickSimulationCase(category: SimulationCategory, random: () => number = Math.random): SimulationCase {
  const cases = SIMULATION_CASES.filter((item) => item.category === category);
  let ticket = random() * cases.reduce((total, item) => total + item.weight, 0);
  for (const item of cases) {
    ticket -= item.weight;
    if (ticket < 0) return item;
  }
  return cases[cases.length - 1];
}

/** The person's first three contacts with a phone, completed with default contacts who do not share a first name. */
function castContacts(person: Person) {
  const real = person.contacts.filter((contact) => contact.phone.trim()).slice(0, 3);
  const taken = new Set(real.map((contact) => firstWord(contact.name)));
  const fill = SIMULATION_DEFAULTS.contacts.filter((contact) => !taken.has(firstWord(contact.name)));
  return [...real, ...fill].slice(0, 3);
}

/** The Telegram messages of one case, in order: the demo notice, the script and the closing block. Plain text. */
export function caseMessages(simulationCase: SimulationCase, person: Person, at: Date): SimulationStep[] {
  const [c1, c2, c3] = castContacts(person);
  const ago = (ms: number) => clock.format(new Date(at.getTime() - ms));
  const vars: Record<string, string> = {
    usuario: person.name,
    manilla: `Manilla de ${person.name}`,
    edad: SIMULATION_DEFAULTS.age,
    direccion: SIMULATION_DEFAULTS.address,
    hora: clock.format(at),
    hace2h: ago(2 * HOUR_MS),
    hace2h25: ago(2 * HOUR_MS + 25 * 60_000),
    hace3h: ago(3 * HOUR_MS),
    c1: c1.name,
    c2: c2.name,
    c3: c3.name,
    c1r: withRelation(c1.name, c1.relation),
    c2r: withRelation(c2.name, c2.relation),
    c3r: withRelation(c3.name, c3.relation),
  };
  // One pass, so a name that contains braces is never expanded.
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);

  const names: Record<Actor, string> = {
    USUARIO: person.name,
    MANILLA: vars.manilla,
    BOT: 'Soliker Bot',
    C1: c1.name,
    C2: c2.name,
    C3: c3.name,
    L123: 'Línea 123 (SIMULADO)',
    SISTEMA: 'Sistema',
    CHAT: 'Chat',
  };
  const list = (actors: Actor[]) => actors.map((actor) => names[actor]).join(', ');

  const { id, eventType, finalNotice, confirmedBy } = simulationCase;
  const finalState = fill(simulationCase.finalState);
  const summary = fill(simulationCase.summary);
  const firstReply = simulationCase.steps.find((step) => step.type === 'RESPUESTA' && step.from !== 'L123');
  const called123 = simulationCase.steps.some((step) => step.to.includes('L123'));

  const closing: ScriptStep[] = [
    { from: 'BOT', to: ['CHAT'], type: 'CIERRE', text: `Caso #${id} cerrado. Estado final: ${finalState}. Resumen: ${summary}.` },
    ...(finalNotice.length > 0 ? [{ from: 'BOT', to: finalNotice, type: 'ENVIO', text: `"Actualización final: ${summary}. Gracias."` } satisfies ScriptStep] : []),
    {
      from: 'SISTEMA',
      to: ['CHAT'],
      type: 'CIERRE',
      text: [
        'Registro',
        `Caso: #${id}`,
        `Tipo de evento: ${eventType}`,
        `Hora de detección: ${vars.hora}`,
        `Primera respuesta: ${firstReply ? `T+${firstReply.t} (${names[firstReply.from]})` : 'sin respuesta'}`,
        `Confirmó: ${confirmedBy ? names[confirmedBy] : 'nadie a tiempo'}`,
        `¿Se llamó a 123?: ${called123 ? 'Sí (SIMULADO)' : 'No'}`,
        `Estado final: ${finalState}`,
      ].join('\n'),
    },
  ];

  const notice: ScriptStep = { t: '00:00', from: 'SISTEMA', to: ['CHAT'], type: 'ESTADO', text: `MODO DEMO – simulación, no se envía nada real. Caso #${id}.` };
  let time = '00:00';
  return [notice, ...simulationCase.steps, ...closing].map((step, index) => {
    time = step.t ?? time;
    const delivered = step.type === 'ENVIO' && !step.noMark ? `\n✓ Entregado a ${list(step.to)}` : '';
    return {
      delayMs: index * SIMULATION_MESSAGE_GAP_MS,
      text: `${step.urgent ? '🚨' : ICON[step.type]} [T+${time}] ${names[step.from]} → ${list(step.to)} · ${step.type}\n${fill(step.text)}${delivered}`,
    };
  });
}
