import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import type { ApiError } from '../api/client';
import { useAuth, useUser } from '../auth/AuthContext';

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Find a space'],
  [/^\/resources\/.+/, 'Schedule'],
  [/^\/bookings/, 'My bookings'],
  [/^\/activity/, 'Activity'],
];

export function Shell() {
  const user = useUser();
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    document.title = `${TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Not found'} · Slotkeeper`;
    if (first.current) first.current = false;
    else document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="bar">
        <div className="bar__inner">
          <span className="logo">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <path d="M7 8h10M7 12h6M7 16h8" />
            </svg>
            Slotkeeper
          </span>
          <nav aria-label="Main" className="nav">
            <NavLink to="/" end>
              Find a space
            </NavLink>
            <NavLink to="/bookings">My bookings</NavLink>
            <NavLink to="/activity">Activity</NavLink>
          </nav>
          <div className="who">
            <span className="who__name">
              {user.fullName}
              {user.role === 'admin' && <span className="pill pill--admin">Admin</span>}
            </span>
            <button type="button" className="link-btn" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <p className="state" role="status">
      <span className="spinner" aria-hidden="true" /> {label}…
    </p>
  );
}

export function ErrorBox({ error, onRetry }: { error: ApiError | undefined; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <p>
        <strong>{error?.status === 404 ? 'Not found.' : 'Something went wrong.'}</strong> {error?.message}
      </p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="state state--empty">{children}</div>;
}
