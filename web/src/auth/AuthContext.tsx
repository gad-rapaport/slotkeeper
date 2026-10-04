import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, setCsrfToken, setUnauthenticatedHandler } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  status: 'checking' | 'signed-out' | 'signed-in' | 'unreachable';
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

interface SessionPayload {
  user: User;
  csrfToken: string;
}

type SessionProbe = SessionPayload | { user: null; csrfToken: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('checking');
  const [user, setUser] = useState<User | null>(null);
  const [attempt, setAttempt] = useState(0);

  const applySession = useCallback((s: SessionPayload | null) => {
    setCsrfToken(s?.csrfToken ?? null);
    setUser(s?.user ?? null);
    setStatus(s ? 'signed-in' : 'signed-out');
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(() => applySession(null));
    return () => setUnauthenticatedHandler(null);
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    api<SessionProbe>('/api/auth/session').then(
      (s) => !cancelled && applySession(s.user ? s : null),
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) applySession(null);
        else setStatus('unreachable');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [applySession, attempt]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const s = await api<SessionPayload>('/api/auth/login', { method: 'POST', body: { email, password } });
      applySession(s);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      applySession(null);
    }
  }, [applySession]);

  const value = useMemo(
    () => ({ status, user, signIn, signOut, retry: () => setAttempt((a) => a + 1) }),
    [status, user, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Signed-in user; only call from screens rendered behind the auth gate. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without a signed-in user');
  return user;
}
