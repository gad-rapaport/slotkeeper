import { useCallback, useEffect, useState } from 'react';
import type { DependencyList } from 'react';
import { isAbort, toApiError } from '../api/client';
import type { ApiError } from '../api/client';

export interface Resource<T> {
  status: 'loading' | 'success' | 'error';
  data: T | undefined;
  error: ApiError | undefined;
  reload: () => void;
  setData: (data: T) => void;
}

/**
 * Loads data for a screen and exposes explicit loading / error / success states. Previous data is kept
 * while a reload is in flight so tables do not flash empty between pages.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList): Resource<T> {
  const [state, setState] = useState<{ status: Resource<T>['status']; data?: T; error?: ApiError }>({
    status: 'loading',
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, status: 'loading' }));
    load(controller.signal).then(
      (data) => setState({ status: 'success', data }),
      (err: unknown) => {
        if (isAbort(err) || controller.signal.aborted) return;
        setState((s) => ({ status: 'error', data: s.data, error: toApiError(err) }));
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((data: T) => setState({ status: 'success', data }), []);
  return { status: state.status, data: state.data, error: state.error, reload, setData };
}
