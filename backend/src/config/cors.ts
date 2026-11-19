import type { FastifyCorsOptions } from '@fastify/cors';

/** @fastify/cors allows only GET, HEAD and POST by default; the panel also writes with PUT. Request headers (Authorization) are reflected. */
export function corsOptions(origin: string): FastifyCorsOptions {
  return { origin, methods: ['GET', 'HEAD', 'POST', 'PUT', 'OPTIONS'] };
}
