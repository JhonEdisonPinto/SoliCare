import type { FastifyInstance } from 'fastify';
import { CARE_BODY_LIMIT_BYTES, emptyCareData, validateCareDocument } from '../care/document.js';
import type { CareStore } from '../care/store.js';

export type CareRouteOptions = {
  store: CareStore;
  /** True when the Authorization header carries the panel key (see createPanelAuth). */
  isAuthorized: (authorization: string | undefined) => boolean;
};

const isVersion = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2_000_000_000;

/**
 * The care document shared by every panel: GET returns `{ version, data }`; PUT stores a new document
 * only when `baseVersion` is the stored version, so concurrent edits never overwrite each other silently.
 * Both routes need the panel key; it is checked before the body is read.
 */
export async function registerCareRoutes(app: FastifyInstance, { store, isAuthorized }: CareRouteOptions): Promise<void> {
  const requireKey = async (request: { headers: { authorization?: string } }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    if (!isAuthorized(request.headers.authorization)) return reply.code(401).send({ error: 'Unauthorized' });
  };

  app.get('/api/v1/care', { onRequest: requireKey }, async () => {
    const stored = await store.get();
    return stored ? { version: stored.version, data: stored.data } : { version: 0, data: emptyCareData() };
  });

  app.put<{ Body: unknown }>('/api/v1/care', { onRequest: requireKey, bodyLimit: CARE_BODY_LIMIT_BYTES }, async (request, reply) => {
    const body = request.body as { baseVersion?: unknown; data?: unknown } | null;
    if (!body || typeof body !== 'object' || !isVersion(body.baseVersion)) {
      return reply.code(400).send({ error: 'Invalid payload', expected: { baseVersion: 'integer >= 0', data: 'care document, version 1' } });
    }
    const validation = validateCareDocument(body.data);
    if (!validation.ok) return reply.code(400).send({ error: 'Invalid document', detail: validation.reason });

    const result = await store.replace(body.baseVersion, validation.data);
    if (!result.ok) return reply.code(409).send({ error: 'Conflict', version: result.current.version, data: result.current.data });
    return { version: result.version, data: validation.data };
  });
}
