/**
 * The scripts of the simulated "Soliker Bot" agent. This file is data: edit the texts here without touching
 * the playback in simulation.ts. It is not a real AI, and nothing here reaches anyone outside the Telegram group.
 *
 * Placeholders: {usuario} {manilla} {edad} {direccion} {hora} {hace2h} {hace2h25} {hace3h}, {c1} {c2} {c3}
 * (contact name) and {c1r} {c2r} {c3r} (name and relation). The wording avoids "él" and "lo" because the
 * person comes from the panel and may be a woman.
 */

export type SimulationCategory = 'caida' | 'ausencia';
export type StepType = 'ESTADO' | 'ENVIO' | 'LLAMADA' | 'RESPUESTA' | 'TIMER' | 'CIERRE';
export type Actor = 'USUARIO' | 'MANILLA' | 'BOT' | 'C1' | 'C2' | 'C3' | 'L123' | 'SISTEMA' | 'CHAT';

export type ScriptStep = {
  /** Simulated time as mm:ss. Without it the step happens at the time of the previous one. */
  t?: string;
  from: Actor;
  to: Actor[];
  type: StepType;
  text: string;
  /** Uses the alarm icon. */
  urgent?: boolean;
  /** An ENVIO whose delivery marks come in the next step. */
  noMark?: boolean;
};

export type SimulationCase = {
  id: string;
  name: string;
  category: SimulationCategory;
  eventType: string;
  /** Relative chance in the draw (percent of all cases). */
  weight: number;
  steps: ScriptStep[];
  finalState: string;
  /** One or two lines, without a final period. */
  summary: string;
  /** Who gets the final update. Empty in cases that never involve the contacts. */
  finalNotice: Actor[];
  /** Who confirmed the situation; null when nobody did in time. */
  confirmedBy: Actor | null;
};

/** Used where the panel has no data: people have no age or address, and may have fewer than three contacts. */
export const SIMULATION_DEFAULTS = {
  age: '78',
  address: 'Calle 10 # 5-20 (dirección de ejemplo)',
  contacts: [
    { name: 'Laura', relation: 'hija' },
    { name: 'Andrés', relation: 'hijo' },
    { name: 'Marta', relation: 'vecina' },
  ],
};

const ALL: Actor[] = ['C1', 'C2', 'C3'];

const step = (t: string | undefined, from: Actor, to: Actor | Actor[], type: StepType, text: string, extra: Pick<ScriptStep, 'urgent' | 'noMark'> = {}): ScriptStep => ({
  ...(t ? { t } : {}),
  from,
  to: Array.isArray(to) ? to : [to],
  type,
  text,
  ...extra,
});

/** B-INICIO-CAIDA */
const fallStart = (id: string): ScriptStep[] => [
  step('00:00', 'MANILLA', 'BOT', 'ESTADO', 'Evento: posible caída (impacto fuerte seguido de quietud).'),
  step('00:00', 'BOT', 'CHAT', 'ESTADO', `Posible caída detectada – {usuario} – en casa. Abriendo caso #${id}.`, { urgent: true }),
  step('00:00', 'BOT', 'MANILLA', 'ENVIO', 'Pre-alerta: vibración y pitido 15 s. "¿Está bien? Presione el botón para cancelar."'),
  step('00:00', 'SISTEMA', 'CHAT', 'TIMER', 'Pre-alerta 15 s en curso…'),
];

/** B-CONTACTO-USUARIO up to the call; the case adds the answer, or `noAnswer` follows it. */
const callUser: ScriptStep[] = [
  step('00:15', 'SISTEMA', 'CHAT', 'TIMER', 'Pre-alerta terminada sin cancelación.'),
  step('00:16', 'BOT', 'USUARIO', 'LLAMADA', 'Llamando a {usuario} (celular)…'),
  step('00:16', 'BOT', 'MANILLA', 'ENVIO', 'Pitido intermitente: "Soliker Bot intenta comunicarse con usted."'),
];
const noAnswer = step('01:16', 'BOT', 'CHAT', 'LLAMADA', '{usuario} no contestó (1 min).');

const DEFAULT_ALERT = 'Alerta: posible caída de {usuario} a las {hora} en su casa. No responde a la llamada. ¿Puede ayudar? Responda: Voy en camino / Ya estoy con {usuario} / No puedo ir.';

/** B-ALERTA-SIMULTANEA */
const alertAll = (text: string = DEFAULT_ALERT): ScriptStep[] => [
  step(undefined, 'BOT', 'CHAT', 'ESTADO', 'Enviando alerta simultánea a 3 contactos: {c1r}, {c2r}, {c3r}.'),
  step(undefined, 'BOT', ALL, 'ENVIO', `"${text}"`, { noMark: true }),
  step(undefined, 'SISTEMA', 'CHAT', 'ESTADO', '✓ Entregado a {c1} · ✓ Entregado a {c2} · ✓ Entregado a {c3}'),
  step(undefined, 'SISTEMA', 'CHAT', 'TIMER', 'Inicia ventana de confirmación de 5 min.'),
];

/** B-ESCALAMIENTO-123 */
const escalate = ({ state, contact = 'contacto en camino: ninguno', event = 'caída', note = '' }: { state: string; contact?: string; event?: string; note?: string }): ScriptStep[] => [
  step(undefined, 'BOT', 'CHAT', 'ESTADO', 'Escalando a Línea 123 (SIMULADO).', { urgent: true }),
  step(undefined, 'BOT', 'L123', 'LLAMADA', 'Llamando a Línea 123 (SIMULADO)…'),
  step(undefined, 'BOT', 'L123', 'ENVIO', `(SIMULADO) Datos enviados: {usuario}, {edad} años, dirección {direccion}, evento "${event}", hora {hora}, estado conocido: ${state}, ${contact}.${note ? ` Nota: ${note}.` : ''}`),
  step(undefined, 'L123', 'BOT', 'RESPUESTA', '"Ambulancia asignada. Tiempo estimado: 15 min." (SIMULADO)'),
  step(undefined, 'BOT', ALL, 'ENVIO', '"Se solicitó ambulancia para {usuario} (llegada estimada 15 min)."'),
];

export const SIMULATION_CASES: SimulationCase[] = [
  {
    id: 'C01',
    name: 'Falsa alarma cancelada en la manilla',
    category: 'caida',
    eventType: 'Caída',
    weight: 8,
    steps: [
      ...fallStart('C01'),
      step('00:08', 'USUARIO', 'MANILLA', 'RESPUESTA', 'Presiona el botón (cancela).'),
      step('00:08', 'BOT', 'CHAT', 'ESTADO', 'Pre-alerta cancelada por el usuario a los 8 s.'),
      step('00:09', 'BOT', 'MANILLA', 'ENVIO', 'Pitido corto de confirmación: "Alerta cancelada."'),
      step('00:10', 'BOT', 'CHAT', 'ESTADO', 'No se avisa a los contactos.'),
    ],
    finalState: 'CANCELADA_FALSA_ALARMA',
    summary: '{usuario} canceló la pre-alerta desde la manilla a los 8 s',
    finalNotice: [],
    confirmedBy: 'USUARIO',
  },
  {
    id: 'C02',
    name: 'Usuario contesta: está bien',
    category: 'caida',
    eventType: 'Caída',
    weight: 9,
    steps: [
      ...fallStart('C02'),
      ...callUser,
      step('00:30', 'USUARIO', 'BOT', 'RESPUESTA', '"Estoy bien, se me cayó al sentarme, no me pasó nada."'),
      step('00:31', 'BOT', 'USUARIO', 'ENVIO', '"Entendido. Si siente dolor más tarde, presione el botón por 3 s."'),
      step('00:32', 'BOT', 'CHAT', 'ESTADO', 'Usuario confirma que está bien. No se escala.'),
      step('00:33', 'BOT', 'C1', 'ENVIO', '"Informativo: la manilla de {usuario} detectó una posible caída a las {hora}. Contestó y dice estar bien."'),
    ],
    finalState: 'ATENDIDA_SIN_LESION',
    summary: '{usuario} contestó y confirmó que está bien',
    finalNotice: ['C1'],
    confirmedBy: 'USUARIO',
  },
  {
    id: 'C03',
    name: 'Usuario contesta: se siente mal',
    category: 'caida',
    eventType: 'Caída',
    weight: 10,
    steps: [
      ...fallStart('C03'),
      ...callUser,
      step('00:40', 'USUARIO', 'BOT', 'RESPUESTA', '"Me caí, me duele mucho la cadera, no me puedo parar."'),
      step('00:41', 'BOT', 'CHAT', 'ESTADO', 'Emergencia confirmada por el usuario.', { urgent: true }),
      step('00:41', 'BOT', 'USUARIO', 'ENVIO', '"No se mueva. Ya estamos pidiendo ayuda y avisando a su familia."'),
      ...escalate({ state: 'dolor fuerte en cadera, consciente' }),
      ...alertAll('{usuario} se cayó y reporta dolor en la cadera. Ya se pidió ambulancia.'),
      step('01:30', 'C1', 'BOT', 'RESPUESTA', 'Voy en camino (10 min).'),
      step('01:31', 'BOT', ['C2', 'C3'], 'ENVIO', '"{c1} ya va en camino."'),
      step('01:32', 'C3', 'BOT', 'RESPUESTA', 'Ya estoy con {usuario} (llegué primero).'),
      step('01:33', 'BOT', ['C1', 'C2'], 'ENVIO', '"{c3} ya está con {usuario} esperando la ambulancia."'),
    ],
    finalState: 'ATENDIDA_EMERGENCIA_123',
    summary: '{usuario} reportó dolor en la cadera. Ambulancia solicitada y {c3} acompaña mientras llega',
    finalNotice: ALL,
    confirmedBy: 'USUARIO',
  },
  {
    id: 'C04',
    name: 'Primer contacto responde y lo atiende',
    category: 'caida',
    eventType: 'Caída',
    weight: 10,
    steps: [
      ...fallStart('C04'),
      ...callUser,
      noAnswer,
      ...alertAll(),
      step('02:00', 'C1', 'BOT', 'RESPUESTA', 'Voy en camino.'),
      step('02:01', 'BOT', 'C1', 'LLAMADA', 'Llamando a {c1}… {c1} contestó.'),
      step('02:02', 'BOT', 'CHAT', 'ESTADO', 'Resumen de la llamada: {c1} llega en 5 min, tiene llave de la casa.'),
      step('02:03', 'BOT', ['C2', 'C3'], 'ENVIO', '"{c1} va en camino, no es necesario que vayan. Les avisamos cualquier novedad."'),
      step('07:10', 'C1', 'BOT', 'RESPUESTA', '"Ya llegué. Se resbaló en el baño, tiene un golpe en el brazo pero está bien y consciente."'),
      step('07:11', 'BOT', 'C1', 'ENVIO', '"Gracias. ¿Necesita ambulancia?"'),
      step('07:11', 'C1', 'BOT', 'RESPUESTA', '"No, voy con {usuario} a la EPS."'),
    ],
    finalState: 'ATENDIDA_POR_FAMILIAR',
    summary: '{c1} llegó y atendió a {usuario}, que tiene un golpe en el brazo y va a la EPS',
    finalNotice: ALL,
    confirmedBy: 'C1',
  },
  {
    id: 'C05',
    name: 'Contacto 1 no responde, Contacto 2 confirma emergencia',
    category: 'caida',
    eventType: 'Caída',
    weight: 10,
    steps: [
      ...fallStart('C05'),
      ...callUser,
      noAnswer,
      ...alertAll(),
      step('02:30', 'BOT', 'C1', 'LLAMADA', 'Llamando a {c1}… no contestó.'),
      step('02:45', 'BOT', 'C2', 'LLAMADA', 'Llamando a {c2}… {c2} contestó.'),
      step('02:46', 'C2', 'BOT', 'RESPUESTA', 'Voy en camino (estoy a 3 cuadras).'),
      step('02:47', 'BOT', ['C1', 'C3'], 'ENVIO', '"{c2} va en camino."'),
      step('05:00', 'C2', 'BOT', 'RESPUESTA', '"Encontré a {usuario} en el piso, con confusión y sin responder bien."'),
      step('05:01', 'BOT', 'CHAT', 'ESTADO', 'Emergencia confirmada por familiar.', { urgent: true }),
      ...escalate({ state: 'con confusión, respuesta lenta', contact: 'contacto en sitio: {c2}' }),
      step('05:30', 'BOT', 'C2', 'ENVIO', '"No mueva a {usuario}. Si deja de respirar, llame de inmediato al 123 por su cuenta."'),
    ],
    finalState: 'ATENDIDA_EMERGENCIA_123',
    summary: '{c2} encontró a {usuario} con confusión. Ambulancia solicitada y {c2} permanece en el lugar',
    finalNotice: ALL,
    confirmedBy: 'C2',
  },
  {
    id: 'C06',
    name: 'Nadie responde en 5 min, escala a 123',
    category: 'caida',
    eventType: 'Caída',
    weight: 10,
    steps: [
      ...fallStart('C06'),
      ...callUser,
      noAnswer,
      ...alertAll(),
      step('02:30', 'BOT', 'C1', 'LLAMADA', 'Llamando a {c1}… no contestó.'),
      step('03:00', 'BOT', 'C2', 'LLAMADA', 'Llamando a {c2}… no contestó.'),
      step('03:30', 'BOT', 'C3', 'LLAMADA', 'Llamando a {c3}… no contestó.'),
      step('04:00', 'BOT', 'USUARIO', 'LLAMADA', 'Segundo intento con {usuario}… no contestó.'),
      step('06:16', 'SISTEMA', 'CHAT', 'TIMER', 'Ventana de 5 min vencida sin confirmación.'),
      ...escalate({ state: 'no responde' }),
      step('09:00', 'C1', 'BOT', 'RESPUESTA', '(tardía) "Perdón, estaba en una reunión. ¿Qué pasó?"'),
      step('09:01', 'BOT', 'C1', 'ENVIO', '"Se detectó una caída y nadie respondió en 5 min, así que se pidió ambulancia. Llega en unos 12 min. ¿Puede ir a la casa?"'),
      step('09:01', 'C1', 'BOT', 'RESPUESTA', 'Voy en camino.'),
    ],
    finalState: 'ATENDIDA_EMERGENCIA_123 (motivo: sin respuesta)',
    summary: 'Nadie respondió en 5 min y se pidió ambulancia. {c1} va en camino',
    finalNotice: ALL,
    confirmedBy: null,
  },
  {
    id: 'C07',
    name: 'Familiar no puede ir, va la vecina',
    category: 'caida',
    eventType: 'Caída',
    weight: 8,
    steps: [
      ...fallStart('C07'),
      ...callUser,
      noAnswer,
      ...alertAll(),
      step('01:40', 'C1', 'BOT', 'RESPUESTA', 'No puedo ir (estoy en otra ciudad).'),
      step('01:50', 'C2', 'BOT', 'RESPUESTA', 'No puedo ir (estoy en el trabajo, a 1 h).'),
      step('01:51', 'BOT', 'C3', 'LLAMADA', 'Llamando a {c3}… {c3} contestó.'),
      step('01:52', 'C3', 'BOT', 'RESPUESTA', 'Voy en camino (estoy cerca).'),
      step('01:53', 'BOT', ['C1', 'C2'], 'ENVIO', '"{c3r} va a la casa de {usuario}."'),
      step('04:00', 'C3', 'BOT', 'RESPUESTA', '"Estaba en el piso de la sala, dice que solo se mareó. Ya le ayudé a sentarse en el sofá."'),
      step('04:01', 'BOT', 'C3', 'ENVIO', '"Gracias, {c3}. ¿Puede quedarse con {usuario} hasta que llegue un familiar?"'),
      step('04:01', 'C3', 'BOT', 'RESPUESTA', 'Sí.'),
      step('04:02', 'BOT', ['C1', 'C2'], 'ENVIO', '"{usuario} está bien, fue un mareo. {c3} se queda acompañando. Se recomienda revisión médica hoy."'),
    ],
    finalState: 'ATENDIDA_POR_CONTACTO ({c3r})',
    summary: '{c3} atendió a {usuario} tras un mareo y se queda acompañando. Se recomienda revisión médica hoy',
    finalNotice: ALL,
    confirmedBy: 'C3',
  },
  {
    id: 'C08',
    name: 'Familiar ya está con él: falsa alarma',
    category: 'caida',
    eventType: 'Caída',
    weight: 7,
    steps: [
      ...fallStart('C08'),
      ...callUser,
      noAnswer,
      ...alertAll(),
      step('01:30', 'C2', 'BOT', 'RESPUESTA', 'Ya estoy con {usuario}.'),
      step('01:31', 'BOT', 'C2', 'LLAMADA', 'Llamando a {c2}… {c2} contestó.'),
      step('01:32', 'C2', 'BOT', 'RESPUESTA', '"Está bien. Se quitó la manilla para bañarse y se le cayó al piso."'),
      step('01:33', 'BOT', 'CHAT', 'ESTADO', 'Falsa alarma confirmada por familiar.'),
      step('01:34', 'BOT', ['C1', 'C3'], 'ENVIO', '"Falsa alarma: {c2} está con {usuario} y todo está bien."'),
      step('01:35', 'BOT', 'C2', 'ENVIO', '"Por favor ayúdele a ponerse la manilla de nuevo."'),
    ],
    finalState: 'FALSA_ALARMA_CONFIRMADA',
    summary: 'La manilla se cayó al piso durante el baño. {usuario} está bien y {c2} la vuelve a poner',
    finalNotice: ALL,
    confirmedBy: 'C2',
  },
  {
    id: 'C09',
    name: 'Caída y la manilla se desconecta en pleno proceso',
    category: 'caida',
    eventType: 'Caída',
    weight: 8,
    steps: [
      ...fallStart('C09'),
      step('00:10', 'SISTEMA', 'CHAT', 'ESTADO', 'Se perdió la conexión con la manilla (último dato: batería 4 %).', { urgent: true }),
      step('00:11', 'BOT', 'CHAT', 'ESTADO', 'No se puede confirmar si la pre-alerta fue cancelada. Se continúa el protocolo por precaución.'),
      // The wristband is offline here, so the block is reduced to the call to the cell phone.
      step('00:16', 'BOT', 'USUARIO', 'LLAMADA', 'Llamando a {usuario} (celular)…'),
      noAnswer,
      ...alertAll(`${DEFAULT_ALERT} La manilla se desconectó después de la alerta.`),
      step('02:10', 'C1', 'BOT', 'RESPUESTA', 'Voy en camino (15 min).'),
      step('02:11', 'BOT', ['C2', 'C3'], 'ENVIO', '"{c1} va en camino, pero tarda 15 min. {c3}, ¿puede pasar a revisar?"'),
      step('02:40', 'C3', 'BOT', 'RESPUESTA', 'Voy en camino.'),
      step('04:30', 'C3', 'BOT', 'RESPUESTA', '"Está bien, se agachó a recoger algo y la manilla se apagó por batería."'),
      step('04:31', 'BOT', ['C1', 'C2'], 'ENVIO', '"{usuario} está bien. La manilla se descargó. {c1}, por favor póngala a cargar al llegar."'),
    ],
    finalState: 'ATENDIDA_POR_CONTACTO (observación: manilla descargada)',
    summary: '{c3} verificó que {usuario} está bien. La manilla se apagó por batería',
    finalNotice: ALL,
    confirmedBy: 'C3',
  },
  {
    id: 'C10',
    name: 'Desconexión prolongada: manilla descargada',
    category: 'ausencia',
    eventType: 'Desconexión',
    weight: 7,
    steps: [
      step('00:00', 'SISTEMA', 'CHAT', 'ESTADO', 'Manilla de {usuario} sin conexión hace 2 h. Último dato: {hace2h}, batería 6 %, sin caídas, en movimiento normal.'),
      step('00:00', 'BOT', 'CHAT', 'ESTADO', 'Desconexión prolongada. Abriendo caso #C10. Causa probable: batería (se avisó batería baja a las {hace2h25}).', { urgent: true }),
      step('00:01', 'BOT', 'USUARIO', 'LLAMADA', 'Llamando a {usuario}… {usuario} contestó.'),
      step('00:20', 'USUARIO', 'BOT', 'RESPUESTA', '"Estoy bien, no sabía que se había apagado."'),
      step('00:21', 'BOT', 'USUARIO', 'ENVIO', '"Por favor ponga la manilla a cargar. Mientras está apagada no podemos detectar caídas."'),
      step('00:22', 'BOT', 'C1', 'ENVIO', '"Informativo: la manilla de {usuario} estuvo apagada 2 h por batería. {usuario} está bien. Le pedimos que la cargue."'),
      step('40:00', 'SISTEMA', 'CHAT', 'ESTADO', 'Manilla reconectada. Batería 35 % y cargando.'),
    ],
    finalState: 'RESUELTA_RECONECTADA',
    summary: 'La manilla se apagó por batería. {usuario} está bien y ya está cargando',
    finalNotice: ['C1'],
    confirmedBy: 'USUARIO',
  },
  {
    id: 'C11',
    name: 'Desconexión prolongada: lo encuentran caído',
    category: 'ausencia',
    eventType: 'Desconexión',
    weight: 7,
    steps: [
      step('00:00', 'SISTEMA', 'CHAT', 'ESTADO', 'Manilla de {usuario} sin conexión hace 2 h. Último dato: {hace2h}, batería 60 %, movimiento brusco justo antes de desconectarse.'),
      step('00:00', 'BOT', 'CHAT', 'ESTADO', 'Desconexión prolongada con señal sospechosa (movimiento brusco y batería suficiente). Abriendo caso #C11 con prioridad alta.', { urgent: true }),
      step('00:01', 'BOT', 'USUARIO', 'LLAMADA', 'Llamando a {usuario}… no contestó.'),
      step('01:00', 'BOT', 'USUARIO', 'LLAMADA', 'Segundo intento… no contestó.'),
      ...alertAll('La manilla de {usuario} lleva 2 h sin conexión y no contesta el teléfono. ¿Alguien puede ir a verificar?'),
      step('02:00', 'C3', 'BOT', 'RESPUESTA', 'Voy en camino.'),
      step('02:01', 'BOT', ['C1', 'C2'], 'ENVIO', '"{c3} va a verificar."'),
      step('05:00', 'C3', 'BOT', 'RESPUESTA', '"No abre. Veo a {usuario} por la ventana, en el piso de la cocina."'),
      step('05:01', 'BOT', 'CHAT', 'ESTADO', 'Emergencia confirmada por contacto.', { urgent: true }),
      ...escalate({ state: 'en el piso, sin respuesta, puerta cerrada', contact: 'contacto en sitio: {c3}', event: 'desconexión prolongada', note: 'se requiere apoyo para ingresar' }),
      step('05:30', 'C1', 'BOT', 'RESPUESTA', 'Voy en camino con la llave (20 min).'),
      step('05:31', 'BOT', 'C3', 'ENVIO', '"La ambulancia va en camino y {c1} lleva la llave. Por favor espere en la puerta."'),
    ],
    finalState: 'ATENDIDA_EMERGENCIA_123 (origen: desconexión)',
    summary: '{c3} vio a {usuario} en el piso. Ambulancia solicitada y {c1} lleva la llave',
    finalNotice: ALL,
    confirmedBy: 'C3',
  },
  {
    id: 'C12',
    name: 'Inactividad prolongada: estaba durmiendo',
    category: 'ausencia',
    eventType: 'Inactividad',
    weight: 6,
    steps: [
      step('00:00', 'SISTEMA', 'CHAT', 'ESTADO', 'Sin movimiento hace 3 h ({hace3h} a {hora}). Manilla conectada, batería 70 %.'),
      step('00:00', 'BOT', 'CHAT', 'ESTADO', 'Inactividad prolongada. Abriendo caso #C12.', { urgent: true }),
      step('00:01', 'BOT', 'MANILLA', 'ENVIO', 'Vibración + pitido 15 s: "Presione el botón si está bien."'),
      step('00:16', 'SISTEMA', 'CHAT', 'TIMER', 'Sin respuesta en la manilla.'),
      step('00:17', 'BOT', 'USUARIO', 'LLAMADA', 'Llamando a {usuario}… {usuario} contestó.'),
      step('00:40', 'USUARIO', 'BOT', 'RESPUESTA', '"Estaba haciendo la siesta, estoy bien."'),
      step('00:41', 'BOT', 'CHAT', 'ESTADO', 'Usuario confirma que está bien. No se avisa a los contactos.'),
    ],
    finalState: 'ATENDIDA_SIN_LESION',
    summary: '{usuario} estaba haciendo la siesta y confirmó que está bien',
    finalNotice: [],
    confirmedBy: 'USUARIO',
  },
];
