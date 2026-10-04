export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Per-field messages from a 400/409/422 response, keyed by field name. */
  get fields(): Record<string, string> {
    const f = this.details?.fields;
    return f && typeof f === 'object' ? (f as Record<string, string>) : {};
  }
}

let csrfToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function setUnauthenticatedHandler(handler: (() => void) | null) {
  onUnauthenticated = handler;
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
}

export async function api<T>(
  path: string,
  { method = 'GET', body, signal, query, headers: extraHeaders }: Options = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  Object.assign(headers, extraHeaders);

  let url = path;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Cannot reach Slotkeeper. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
    requestId?: string;
  } | null;

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthenticated?.();
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'INTERNAL',
      data?.error?.message ?? 'Something went wrong. Try again.',
      data?.error?.details,
      data?.requestId,
    );
  }
  return data as T;
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(0, 'CLIENT', err instanceof Error ? err.message : 'Unexpected error.');
}
