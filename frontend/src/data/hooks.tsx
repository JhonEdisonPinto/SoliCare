import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { TelemetrySource } from './api';
import { ApiError } from './api';
import type { CareRepository } from './store';
import type { Alert, CareData, Device, Reading } from './types';
import { alertReferenceTime, deriveAlerts, isOpen } from './alerts';
import { summarizeDevices, summarizePeople, unassignedDevices, type DeviceSummary, type PersonSummary } from './summary';
import { usePolling } from './polling';

/** Readings fetched per device for summaries: 2.5 h at the 30 s reporting cadence. */
export const SUMMARY_READING_LIMIT = 300;

export type TelemetryStatus = 'loading' | 'ready' | 'unreachable';

export type TelemetryState = {
  /** loading: no answer yet. ready: last request succeeded. unreachable: last request failed (older data may remain). */
  status: TelemetryStatus;
  devices: Device[];
  readingsByDevice: Record<string, Reading[]>;
  lastSuccessAt: number | null;
  error: string | null;
  source: TelemetrySource;
  refresh: () => void;
};

type TelemetryData = Omit<TelemetryState, 'source' | 'refresh'>;

type AlertsValue = { alerts: Alert[]; open: Alert[]; pendingCount: number };

const TelemetryContext = createContext<TelemetryState | null>(null);
const RepositoryContext = createContext<CareRepository | null>(null);
const AlertsContext = createContext<AlertsValue | null>(null);
const NowContext = createContext<number>(Date.now());
const ReferenceNowContext = createContext<number>(Date.now());

const subscribeVisibility = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

/** True while the tab is hidden, which is also when polling is paused. */
function useDocumentHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
}

function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} must be used inside <DataProvider>`);
  return value;
}

const INITIAL: TelemetryData = { status: 'loading', devices: [], readingsByDevice: {}, lastSuccessAt: null, error: null };

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ocurrió un error inesperado al leer los datos.';
}

export function DataProvider({ source, repository, children }: { source: TelemetrySource; repository: CareRepository; children: ReactNode }) {
  const care = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const devices = await source.listDevices(signal);
        const results = await Promise.allSettled(devices.map((device) => source.listTelemetry(device.device_id, SUMMARY_READING_LIMIT, signal)));
        if (signal.aborted) return;
        setTelemetry((previous) => {
          const readingsByDevice: Record<string, Reading[]> = {};
          devices.forEach((device, index) => {
            const result = results[index];
            readingsByDevice[device.device_id] =
              result.status === 'fulfilled' ? result.value : previous.readingsByDevice[device.device_id] ?? [];
          });
          return { status: 'ready', devices, readingsByDevice, lastSuccessAt: Date.now(), error: null };
        });
        setNow(Date.now());
      } catch (error) {
        if (signal.aborted) return;
        setTelemetry((previous) => ({ ...previous, status: 'unreachable', error: errorMessage(error) }));
      }
    },
    [source],
  );

  const refresh = usePolling(load, care.settings.pollIntervalSeconds * 1000);

  const telemetryValue = useMemo<TelemetryState>(() => ({ ...telemetry, source, refresh }), [telemetry, source, refresh]);

  // Alerts, statuses and "hace N min" ages are computed against this, not against the raw clock, so a
  // paused or stale view never invents a connection alert (see alertReferenceTime).
  const hidden = useDocumentHidden();
  const referenceNow = alertReferenceTime({
    now,
    lastSuccessAt: telemetry.lastSuccessAt,
    unreachable: telemetry.status === 'unreachable',
    hidden,
    pollIntervalMs: care.settings.pollIntervalSeconds * 1000,
  });

  const derivation = useMemo(
    () =>
      deriveAlerts({
        devices: telemetry.devices,
        readingsByDevice: telemetry.readingsByDevice,
        people: care.people,
        settings: care.settings,
        acknowledgements: care.acknowledgements,
        journal: care.journal,
        now: referenceNow,
      }),
    [telemetry.devices, telemetry.readingsByDevice, care.people, care.settings, care.acknowledgements, care.journal, referenceNow],
  );

  useEffect(() => {
    if (derivation.newJournalEntries.length > 0) void repository.recordAlertEvents(derivation.newJournalEntries);
  }, [derivation.newJournalEntries, repository]);

  const alertsValue = useMemo<AlertsValue>(() => {
    const open = derivation.alerts.filter(isOpen);
    return { alerts: derivation.alerts, open, pendingCount: open.filter((alert) => alert.state === 'pendiente').length };
  }, [derivation.alerts]);

  return (
    <RepositoryContext.Provider value={repository}>
      <TelemetryContext.Provider value={telemetryValue}>
        <NowContext.Provider value={now}>
          <ReferenceNowContext.Provider value={referenceNow}>
            <AlertsContext.Provider value={alertsValue}>{children}</AlertsContext.Provider>
          </ReferenceNowContext.Provider>
        </NowContext.Provider>
      </TelemetryContext.Provider>
    </RepositoryContext.Provider>
  );
}

/** Devices, readings per device and request state, polled while the tab is visible. */
export function useTelemetry(): TelemetryState {
  return required(useContext(TelemetryContext), 'useTelemetry');
}

/** Current local entities (people, contacts, acknowledgements, settings). */
export function useCare(): CareData {
  const repository = useCareActions();
  return useSyncExternalStore(repository.subscribe, repository.getSnapshot);
}

/** Mutations on local entities. */
export function useCareActions(): CareRepository {
  return required(useContext(RepositoryContext), 'useCareActions');
}

/** Wall clock, refreshed every 15 s and after each successful update. */
export function useNow(): number {
  return useContext(NowContext);
}

/**
 * The time statuses and alerts are computed against: the clock while the data is fresh, the time of the
 * last successful update while it is not (tab hidden, server unreachable or an overdue poll), so a
 * viewer-side pause never looks like a silent device.
 */
export function useReferenceNow(): number {
  return useContext(ReferenceNowContext);
}

/** Derived alerts: all, open ones, and the number nobody has acknowledged yet. */
export function useAlerts(): AlertsValue {
  return required(useContext(AlertsContext), 'useAlerts');
}

/** People with their device, status, latest valid vitals and open alerts, sorted by need. */
export function usePeopleSummary(): { people: PersonSummary[]; unassigned: Device[] } {
  const { devices, readingsByDevice } = useTelemetry();
  const { people, settings } = useCare();
  const { alerts } = useAlerts();
  const now = useReferenceNow();
  return useMemo(
    () => ({
      people: summarizePeople(people, devices, readingsByDevice, alerts, now, settings.offlineWindowMinutes),
      unassigned: unassignedDevices(people, devices),
    }),
    [people, devices, readingsByDevice, alerts, now, settings.offlineWindowMinutes],
  );
}

/** Every device (reported by the server or assigned and never seen) with status, person and latest valid vitals. */
export function useDeviceSummaries(): DeviceSummary[] {
  const { devices, readingsByDevice } = useTelemetry();
  const { people, settings } = useCare();
  const { alerts } = useAlerts();
  const now = useReferenceNow();
  return useMemo(
    () => summarizeDevices(devices, people, readingsByDevice, alerts, now, settings.offlineWindowMinutes),
    [devices, people, readingsByDevice, alerts, now, settings.offlineWindowMinutes],
  );
}

export type DeviceHistory = { status: TelemetryStatus; readings: Reading[]; error: string | null; refresh: () => void };

/** A longer history for one device (detail views), polled on the same interval. */
export function useDeviceHistory(deviceId: string | null | undefined, limit: number): DeviceHistory {
  const { source } = useTelemetry();
  const { settings } = useCare();
  const [state, setState] = useState<Omit<DeviceHistory, 'refresh'>>({ status: 'loading', readings: [], error: null });

  useEffect(() => {
    setState({ status: 'loading', readings: [], error: null });
  }, [deviceId, limit]);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!deviceId) return;
      try {
        const readings = await source.listTelemetry(deviceId, limit, signal);
        if (!signal.aborted) setState({ status: 'ready', readings, error: null });
      } catch (error) {
        if (!signal.aborted) setState((previous) => ({ ...previous, status: 'unreachable', error: errorMessage(error) }));
      }
    },
    [source, deviceId, limit],
  );

  const refresh = usePolling(load, settings.pollIntervalSeconds * 1000);
  // usePolling already runs once on mount (unless hidden). Run again only when the device or the limit
  // changes afterwards, and not while the tab is hidden: becoming visible runs the latest task anyway.
  const previousLoad = useRef(load);
  useEffect(() => {
    if (previousLoad.current === load) return;
    previousLoad.current = load;
    if (!document.hidden) refresh();
  }, [load, refresh]);

  return { ...state, refresh };
}
