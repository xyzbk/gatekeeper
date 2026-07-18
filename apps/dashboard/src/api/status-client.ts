import {
  dashboardBootstrapSchema,
  statusResponseSchema,
  type DashboardBootstrap,
  type StatusResponse,
} from '@gatekeeper/contracts';

export interface StatusClient {
  getStatus: (signal?: AbortSignal) => Promise<StatusResponse>;
}

export type BootstrapLoader = (signal?: AbortSignal) => Promise<DashboardBootstrap>;

async function readJson(
  response: Response,
  unavailableMessage: string,
  invalidJsonMessage: string,
): Promise<unknown> {
  if (!response.ok) {
    throw new Error(unavailableMessage);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(invalidJsonMessage);
  }
}

export function createBootstrapLoader(fetcher: typeof fetch = globalThis.fetch): BootstrapLoader {
  let bootstrapPromise: Promise<DashboardBootstrap> | undefined;

  return (signal) => {
    bootstrapPromise ??= fetcher('/bootstrap.json', {
      cache: 'no-store',
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    })
      .then(async (response) => {
        const payload = await readJson(
          response,
          'Gatekeeper bootstrap is unavailable.',
          'Gatekeeper bootstrap returned invalid JSON.',
        );
        const parsed = dashboardBootstrapSchema.safeParse(payload);

        if (!parsed.success) {
          throw new Error('Gatekeeper bootstrap returned an invalid response.');
        }

        return parsed.data;
      })
      .catch((error: unknown) => {
        bootstrapPromise = undefined;
        throw error;
      });

    return bootstrapPromise;
  };
}

export function createStatusClient(
  fetcher: typeof fetch = globalThis.fetch,
  loadBootstrap: BootstrapLoader = createBootstrapLoader(fetcher),
): StatusClient {
  return {
    getStatus: async (signal) => {
      const bootstrap = await loadBootstrap(signal);
      const response = await fetcher(`${bootstrap.apiBaseUrl}/status`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Authorization: `Bearer ${bootstrap.bearerToken}` },
        ...(signal === undefined ? {} : { signal }),
      });
      const payload = await readJson(
        response,
        'Gatekeeper status is unavailable.',
        'Gatekeeper status returned invalid JSON.',
      );
      const parsed = statusResponseSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error('Gatekeeper status returned an invalid response.');
      }

      return parsed.data;
    },
  };
}
