export type TelemetryType = 'lectura' | 'caida';

export type TelemetryPayload = {
  device_id: string;
  tipo: TelemetryType;
  spo2: number;
  pulso: number;
};
