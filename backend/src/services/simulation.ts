import type { Person } from '../care/document.js';

/** How long a simulated fall lasts, from the first message to the closing one. The panel shows it as long. */
export const SIMULATION_DURATION_MS = 25_000;
/** Gap between the fall notice and each simulated call. */
export const SIMULATION_CALL_GAP_MS = 4_000;
/** At most this many contacts get a simulated call. */
export const SIMULATION_MAX_CALLS = 3;

export type SimulationStep = { delayMs: number; text: string };

const clock = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });

const withRelation = (name: string, relation: string) => (relation.trim() ? `${name} (${relation.trim()})` : name);

/**
 * The Telegram messages of one simulated fall, in order: the fall notice, one simulated incoming call per
 * emergency contact with a phone (or the monitoring centre when there is none), and the closing message.
 * Plain text, so names need no escaping.
 */
export function simulationMessages(person: Person, at: Date): SimulationStep[] {
  const who = withRelation(person.name, person.relation);
  const steps: SimulationStep[] = [
    {
      delayMs: 0,
      text: [`🚨 [SIMULACIÓN] Caída detectada`, `👤 ${who}`, `📟 Dispositivo ${person.deviceId ?? 'sin asignar'}`, `🕒 ${clock.format(at)}`].join('\n'),
    },
  ];

  const contacts = person.contacts.filter((contact) => contact.phone.trim()).slice(0, SIMULATION_MAX_CALLS);
  if (contacts.length === 0) {
    steps.push({
      delayMs: SIMULATION_CALL_GAP_MS,
      text: [`📞 [LLAMADA ENTRANTE]`, `Para: Central de monitoreo SoliCare`, `${person.name} tuvo una caída y no tiene contactos de emergencia registrados.`].join('\n'),
    });
  } else {
    contacts.forEach((contact, index) => {
      steps.push({
        delayMs: SIMULATION_CALL_GAP_MS * (index + 1),
        text: [
          `📞 [LLAMADA ENTRANTE]`,
          `Para: ${withRelation(contact.name, contact.relation)} · ${contact.phone.trim()}`,
          `SoliCare: ${person.name} tuvo una caída. Comuníquese con ${person.name} o acuda a su domicilio.`,
        ].join('\n'),
      });
    });
  }

  steps.push({ delayMs: SIMULATION_DURATION_MS, text: `✅ [SIMULACIÓN] ${person.name} está bien. Fin de la simulación.` });
  return steps;
}
