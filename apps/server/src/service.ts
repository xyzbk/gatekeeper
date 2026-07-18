import { randomBytes } from 'node:crypto';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';

import { resolveServicePaths, type ServicePaths } from '@gatekeeper/config';
import {
  serviceMetadataSchema,
  statusResponseSchema,
  type RepositorySnapshot,
  type ReviewRunContract,
  type StatusResponse,
  type ToolAvailability,
} from '@gatekeeper/contracts';
import type { FastifyInstance } from 'fastify';

import { buildGatekeeperServer, type BuildGatekeeperServerOptions } from './server.js';

export interface StartGatekeeperServiceOptions {
  bearerToken?: string;
  dashboardRoot: string;
  logger?: BuildGatekeeperServerOptions['logger'];
  paths?: ServicePaths;
  repository: RepositorySnapshot;
  reviewWorktree: () => Promise<ReviewRunContract>;
  startedAt?: string;
  tools: {
    git: ToolAvailability;
    gh: ToolAvailability;
  };
  version: string;
}

export interface RunningGatekeeperService {
  baseUrl: string;
  bearerToken: string;
  close: () => Promise<void>;
  server: FastifyInstance;
  status: StatusResponse;
}

async function writeServiceMetadata(
  paths: ServicePaths,
  metadata: ReturnType<typeof serviceMetadataSchema.parse>,
): Promise<void> {
  await mkdir(paths.appData, { recursive: true });
  await writeFile(paths.serviceMetadata, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(paths.serviceMetadata, 0o600);
}

export async function startGatekeeperService(
  options: StartGatekeeperServiceOptions,
): Promise<RunningGatekeeperService> {
  const bearerToken = options.bearerToken ?? randomBytes(32).toString('base64url');
  const paths = options.paths ?? resolveServicePaths();
  const startedAt = options.startedAt ?? new Date().toISOString();
  let status: StatusResponse | undefined;
  const serverOptions: BuildGatekeeperServerOptions = {
    bearerToken,
    dashboardRoot: options.dashboardRoot,
    getStatus: () => {
      if (status === undefined) {
        throw new Error('Service status is not ready.');
      }

      return status;
    },
    reviewWorktree: options.reviewWorktree,
    version: options.version,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  };
  const server = await buildGatekeeperServer(serverOptions);

  try {
    await server.listen({ host: '127.0.0.1', port: 0 });
    const address = server.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    status = statusResponseSchema.parse({
      schemaVersion: 1,
      service: {
        state: 'ready',
        version: options.version,
        startedAt,
        baseUrl,
      },
      repository: options.repository,
      tools: options.tools,
      features: {
        modelReasoning: 'disabled',
        projectMemory: 'not_initialized',
      },
      paths,
    });
    const metadata = serviceMetadataSchema.parse({
      schemaVersion: 1,
      pid: process.pid,
      port: address.port,
      baseUrl,
      bearerToken,
      repositoryRoot: options.repository.root,
      startedAt,
    });
    await writeServiceMetadata(paths, metadata);

    return {
      baseUrl,
      bearerToken,
      server,
      status,
      close: async () => {
        try {
          await server.close();
        } finally {
          await rm(paths.serviceMetadata, { force: true });
        }
      },
    };
  } catch (error) {
    try {
      await server.close();
    } finally {
      await rm(paths.serviceMetadata, { force: true });
    }
    throw error;
  }
}
