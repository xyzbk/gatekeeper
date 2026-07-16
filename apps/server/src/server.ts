import { timingSafeEqual } from 'node:crypto';
import type { Writable } from 'node:stream';

import fastifyStatic from '@fastify/static';
import {
  dashboardBootstrapJsonSchema,
  dashboardBootstrapSchema,
  emptyRequestJsonSchema,
  errorEnvelopeJsonSchema,
  errorEnvelopeSchema,
  healthResponseJsonSchema,
  healthResponseSchema,
  statusResponseJsonSchema,
  statusResponseSchema,
  type StatusResponse,
} from '@gatekeeper/contracts';
import fastify, { type FastifyInstance, LogController } from 'fastify';

const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

interface GatekeeperLoggerOptions {
  level: string;
  stream?: Writable;
}

export interface BuildGatekeeperServerOptions {
  bearerToken: string;
  dashboardRoot: string;
  getStatus: () => StatusResponse;
  logger?: false | GatekeeperLoggerOptions;
  version: string;
}

function createError(
  code: 'FORBIDDEN' | 'UNAUTHORIZED' | 'INTERNAL_ERROR' | 'NOT_FOUND' | 'USAGE_ERROR',
  message: string,
) {
  return errorEnvelopeSchema.parse({ error: { code, message } });
}

function isAllowedHost(host: string | undefined): boolean {
  if (host === undefined) {
    return false;
  }

  try {
    const parsedHost = new URL(`http://${host}`);
    return (
      parsedHost.hostname === '127.0.0.1' &&
      parsedHost.host === host &&
      parsedHost.username === '' &&
      parsedHost.password === '' &&
      parsedHost.pathname === '/' &&
      parsedHost.search === '' &&
      parsedHost.hash === ''
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.protocol === 'http:' &&
      parsedOrigin.hostname === '127.0.0.1' &&
      parsedOrigin.host === host
    );
  } catch {
    return false;
  }
}

function hasValidBearerToken(authorization: string | undefined, bearerToken: string): boolean {
  if (authorization === undefined) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${bearerToken}`);
  const actual = Buffer.from(authorization);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isValidationError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'validation' in error;
}

export async function buildGatekeeperServer(
  options: BuildGatekeeperServerOptions,
): Promise<FastifyInstance> {
  const server = fastify({
    ajv: { customOptions: { removeAdditional: false } },
    bodyLimit: 1_048_576,
    logController: new LogController({ disableRequestLogging: true }),
    logger: options.logger ?? { level: 'info' },
  });

  server.addSchema(errorEnvelopeJsonSchema);
  server.addSchema(healthResponseJsonSchema);
  server.addSchema(statusResponseJsonSchema);
  server.addSchema(dashboardBootstrapJsonSchema);
  server.addSchema(emptyRequestJsonSchema);

  server.addHook('onRequest', async (request, reply) => {
    if (!isAllowedHost(request.headers.host)) {
      return reply.code(403).send(createError('FORBIDDEN', 'The request Host is not allowed.'));
    }

    if (!isAllowedOrigin(request.headers.origin, request.headers.host)) {
      return reply.code(403).send(createError('FORBIDDEN', 'The request Origin is not allowed.'));
    }

    if (
      request.url.startsWith('/v1/') &&
      !hasValidBearerToken(request.headers.authorization, options.bearerToken)
    ) {
      return reply
        .code(401)
        .send(createError('UNAUTHORIZED', 'A valid local bearer token is required.'));
    }
  });

  server.setErrorHandler((error, request, reply) => {
    const validationFailure = isValidationError(error);
    server.log.warn(
      {
        requestId: request.id,
        operation: `${request.method} ${request.routeOptions.url ?? 'unmatched-route'}`,
        errorCategory: validationFailure ? 'validation' : 'internal',
      },
      'request rejected',
    );

    if (validationFailure) {
      return reply
        .code(400)
        .send(createError('USAGE_ERROR', 'The request does not match the local API contract.'));
    }

    return reply
      .code(500)
      .send(createError('INTERNAL_ERROR', 'The local service could not complete the request.'));
  });

  server.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(createError('NOT_FOUND', 'The requested local resource was not found.')),
  );

  server.addHook('onSend', async (_request, reply, payload) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('Content-Security-Policy', contentSecurityPolicy)
      .header('Cross-Origin-Resource-Policy', 'same-origin')
      .header('Permissions-Policy', 'camera=(), geolocation=(), microphone=()')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY');

    return payload;
  });

  server.addHook('onResponse', async (request, reply) => {
    server.log.info(
      {
        requestId: request.id,
        operation: `${request.method} ${request.routeOptions.url ?? 'unmatched-route'}`,
        durationMs: reply.elapsedTime,
        resultCount: reply.statusCode < 400 ? 1 : 0,
        resultState: reply.statusCode < 400 ? 'success' : 'rejected',
      },
      'request completed',
    );
  });

  server.get(
    '/health',
    {
      schema: {
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:health-response#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    () => healthResponseSchema.parse({ status: 'ok', version: options.version }),
  );

  server.get(
    '/bootstrap.json',
    {
      schema: {
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:dashboard-bootstrap-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    () =>
      dashboardBootstrapSchema.parse({
        apiBaseUrl: '/v1',
        bearerToken: options.bearerToken,
      }),
  );

  server.get(
    '/v1/status',
    {
      schema: {
        querystring: { $ref: 'gatekeeper:empty-request#' },
        response: {
          200: { $ref: 'gatekeeper:status-response-v1#' },
          400: { $ref: 'gatekeeper:error-envelope#' },
          401: { $ref: 'gatekeeper:error-envelope#' },
          403: { $ref: 'gatekeeper:error-envelope#' },
          500: { $ref: 'gatekeeper:error-envelope#' },
        },
      },
    },
    async (_request, reply) => {
      try {
        return statusResponseSchema.parse(options.getStatus());
      } catch {
        return reply
          .code(500)
          .send(createError('INTERNAL_ERROR', 'The local service status is unavailable.'));
      }
    },
  );

  server.register(fastifyStatic, {
    root: options.dashboardRoot,
    wildcard: false,
  });

  await server.ready();
  return server;
}
