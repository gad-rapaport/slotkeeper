import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Field } from '../components/Field';

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed.');
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <main className="login__card">
        <span className="logo logo--large">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <path d="M7 8h10M7 12h6M7 16h8" />
          </svg>
          Slotkeeper
        </span>
        <h1>Book a room, desk or kit</h1>
        <p className="muted">
          One booking per slot, guaranteed by the database, in each office&apos;s own time zone.
        </p>
        <form className="stack" onSubmit={submit} noValidate>
          {error && (
            <p className="alert alert--error" role="alert">
              {error}
            </p>
          )}
          <Field label="Email">
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button className="btn btn--primary btn--wide" type="submit" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="demo-accounts">
          <p className="small">
            <strong>Demo accounts:</strong> <span className="mono">demo@slotkeeper.test</span> (member),{' '}
            <span className="mono">admin@slotkeeper.test</span> (admin). Passwords are generated per
            installation and kept in the local .env file.
          </p>
        </div>
      </main>
    </div>
  );
}
