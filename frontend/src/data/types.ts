/** Shapes returned by the telemetry API (backend/src/db/database.ts). */
export type TelemetryType = 'lectura' | 'caida';

export type Device = {
  device_id: string;
  /** ISO timestamp of the last report the server received. Always present for API devices. */
  last_seen_at: string;
  last_type: string | null;
  spo2: number | null;
  pulso: number | null;
};

export type Reading = {
  type: string;
  /** 0 means "no valid reading", never a measured value. */
  spo2: number;
  /** 0 means "no valid reading", never a measured value. */
  pulso: number;
  received_at: string;
};

/** Entities the backend does not have yet. They live in the local store. */
export type EmergencyContact = {
  id: string;
  name: string;
  relation: string;
  phone: string;
};

export type Person = {
  id: string;
  name: string;
  /** Relation to the account holder, for example "Mamá". */
  relation: string;
  deviceId: string | null;
  contacts: EmergencyContact[];
  createdAt: string;
};

export type Settings = {
  /** No report for longer than this means "Sin reporte reciente" and a connection alert (README rule 3). */
  offlineWindowMinutes: number;
  pollIntervalSeconds: number;
};

export type AlertKind = 'caida' | 'conexion';
export type AlertState = 'pendiente' | 'atendida' | 'resuelta';

/** What a person did with an alert. Absent means nobody has acted on it. */
export type AlertAck = {
  acknowledgedAt?: string;
  acknowledgeNote?: string;
  resolvedAt?: string;
  resolveNote?: string;
};

/** A condition observed in the data, kept so history survives after readings leave the API window. */
export type AlertJournalEntry = {
  id: string;
  kind: AlertKind;
  deviceId: string;
  /** Fall: reading time. Connection: the last report before the gap. */
  at: string;
  detectedAt: string;
};

export type CareData = {
  version: 1;
  people: Person[];
  acknowledgements: Record<string, AlertAck>;
  journal: Record<string, AlertJournalEntry>;
  settings: Settings;
};

export type Alert = {
  id: string;
  kind: AlertKind;
  deviceId: string;
  personId: string | null;
  /** Fall: reading time. Connection: last report before the gap. */
  at: string;
  /** Connection alerts only: when the gap crossed the offline window. */
  overdueSince?: string;
  state: AlertState;
  acknowledgedAt?: string;
  acknowledgeNote?: string;
  resolvedAt?: string;
  resolveNote?: string;
  /** "datos": the device reported again. "usuario": someone marked it as resolved. */
  resolvedBy?: 'datos' | 'usuario';
};

export const DEFAULT_SETTINGS: Settings = {
  offlineWindowMinutes: 30,
  pollIntervalSeconds: 15,
};
