import { mergeCareData, type MergeReport } from './merge';
import { createMutations, emptyCareData, parseCareData, type ApplyOp, type CareOp, type CareRepository } from './store';
import type { CareData } from './types';

/** A care document as the server stores it. `version` is 0 until the first write. */
export type StoredCare = { version: number; data: CareData };

/** The server could not take a change; `message` is Spanish UI copy. */
export class CareStoreError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'CareStoreError';
  }
}

export type ProbeResult =
  | { kind: 'ok'; stored: StoredCare }
  /** 401: the server wants a panel key (none sent, or a wrong one). */
  | { kind: 'unauthorized' }
  /** 404: the backend has no care route (an older deployment). */
  | { kind: 'absent' }
  /** No answer, a server error or an unreadable body. */
  | { kind: 'unreachable' };

function headers(key: string | null, json = false): Record<string, string> {
  return { Accept: 'application/json', ...(json ? { 'Content-Type': 'application/json' } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}) };
}

function readStored(body: unknown): StoredCare | null {
  if (!body || typeof body !== 'object') return null;
  const { version, data } = body as { version?: unknown; data?: unknown };
  const parsed = parseCareData(data);
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0 || !parsed) return null;
  return { version, data: parsed };
}

/** One `GET /api/v1/care`, sorted into what the panel has to do next. */
export async function probeCare(apiUrl: string, key: string | null, signal?: AbortSignal): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/v1/care`, { signal, headers: headers(key) });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    return { kind: 'unreachable' };
  }
  if (response.status === 401) return { kind: 'unauthorized' };
  if (response.status === 404) return { kind: 'absent' };
  if (!response.ok) return { kind: 'unreachable' };
  const stored = readStored(await response.json().catch(() => null));
  return stored ? { kind: 'ok', stored } : { kind: 'unreachable' };
}

/** How many times a change is re-applied to a fresher document after another panel wrote first. */
export const MAX_CONFLICT_RETRIES = 3;

export interface ServerCareRepository extends CareRepository {
  readonly storage: 'server';
  refresh(signal?: AbortSignal): Promise<void>;
  subscribeErrors(listener: (message: string) => void): () => void;
  /** Version of the document this panel last saw (0: nothing stored on the server yet). */
  getVersion(): number;
  /** Merges data from this browser into the server document (see `mergeCareData`). */
  importLocal(local: CareData): Promise<MergeReport>;
}

type Options = {
  apiUrl: string;
  getKey: () => string | null;
  /** The document fetched at startup. Without it the repository starts empty and unloaded: writes wait for the first successful read. */
  initial?: StoredCare;
  /** The server answered 401: the key is wrong or was changed. */
  onUnauthorized: () => void;
};

/**
 * `CareRepository` backed by `/api/v1/care`. Every change is a pure `careOps` operation applied to the
 * last known server document and written with `PUT { baseVersion, data }`. When another panel wrote first
 * the server answers 409 with its document; the operation is applied again to that one (up to
 * MAX_CONFLICT_RETRIES times), so a stale write never overwrites anything. Writes run one at a time.
 */
export function createServerCareRepository({ apiUrl, getKey, initial, onUnauthorized }: Options): ServerCareRepository {
  const listeners = new Set<() => void>();
  const errorListeners = new Set<(message: string) => void>();
  let data = initial?.data ?? emptyCareData();
  let version = initial?.version ?? 0;
  let loaded = initial !== undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let pendingWrites = 0;

  function adopt(stored: StoredCare) {
    version = stored.version;
    data = stored.data;
    loaded = true;
    listeners.forEach((listener) => listener());
  }

  function unauthorized(): never {
    onUnauthorized();
    throw new CareStoreError('La clave del panel ya no es válida. Vuelva a escribirla.', 401);
  }

  async function load(signal?: AbortSignal) {
    const result = await probeCare(apiUrl, getKey(), signal);
    if (result.kind === 'ok') return result.stored;
    if (result.kind === 'unauthorized') unauthorized();
    throw new CareStoreError('No se pudo conectar con el servidor. No se guardó el cambio.', null);
  }

  async function write(next: CareData, baseVersion: number): Promise<{ ok: true; stored: StoredCare } | { ok: false; current: StoredCare }> {
    let response: Response;
    try {
      response = await fetch(`${apiUrl}/api/v1/care`, {
        method: 'PUT',
        headers: headers(getKey(), true),
        body: JSON.stringify({ baseVersion, data: next }),
      });
    } catch {
      throw new CareStoreError('No se pudo conectar con el servidor. No se guardó el cambio.', null);
    }
    if (response.status === 401) unauthorized();
    const body = await response.json().catch(() => null);
    const stored = readStored(body);
    if (response.ok && stored) return { ok: true, stored };
    if (response.status === 409 && stored) return { ok: false, current: stored };
    if (response.status === 400 || response.status === 413) {
      throw new CareStoreError('El servidor no aceptó los datos: son demasiado grandes o tienen un formato inválido.', response.status);
    }
    throw new CareStoreError(`El servidor no pudo guardar el cambio (código ${response.status}).`, response.status);
  }

  async function run<R>(op: CareOp<R>): Promise<R> {
    if (!loaded) adopt(await load());
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
      const step = op(data, version);
      if (step.data === data) return step.result;
      const outcome = await write(step.data, version);
      if (outcome.ok) {
        adopt(outcome.stored);
        return step.result;
      }
      // Another panel saved first: continue from its document.
      adopt(outcome.current);
    }
    throw new CareStoreError('Otro panel está cambiando los datos al mismo tiempo. No se guardó el cambio; intente de nuevo.', 409);
  }

  const apply: ApplyOp = (op, options) => {
    pendingWrites += 1;
    const result = queue.then(() => run(op));
    queue = result.catch(() => undefined).finally(() => {
      pendingWrites -= 1;
    });
    return result.catch((error: unknown) => {
      // Refused changes are shown by the form that made them; only storage failures need a toast.
      if (error instanceof CareStoreError && !options?.silent) errorListeners.forEach((listener) => listener(error.message));
      throw error;
    });
  };

  const mutations = createMutations(apply);

  return {
    storage: 'server',
    getSnapshot: () => data,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeErrors(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    getVersion: () => version,
    async refresh(signal) {
      // A write in flight will bring the newest document itself.
      if (pendingWrites > 0) return;
      try {
        const stored = await load(signal);
        if (pendingWrites === 0 && (!loaded || stored.version > version)) adopt(stored);
      } catch {
        // Reads fail quietly: the telemetry banner already says when the server is unreachable.
      }
    },
    async importLocal(local) {
      const report = await apply((current, currentVersion) => {
        const merged = mergeCareData(current, currentVersion, local);
        return { data: merged.data, result: merged.report };
      });
      return report;
    },
    ...mutations,
  };
}
