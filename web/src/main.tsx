import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Link, RouterProvider } from 'react-router';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './styles.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Loading, Shell } from './components/Shell';
import { ToastProvider } from './components/Toast';
import { ActivityPage, BookingsPage } from './pages/BookingsPage';
import { LoginPage } from './pages/LoginPage';
import { ResourcePage } from './pages/ResourcePage';
import { ResourcesPage } from './pages/ResourcesPage';

function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to all spaces</Link>
      </p>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <ResourcesPage /> },
      { path: 'resources/:id', element: <ResourcePage /> },
      { path: 'bookings', element: <BookingsPage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

function Gate() {
  const { status, retry } = useAuth();
  if (status === 'checking') return <Loading label="Starting Slotkeeper" />;
  if (status === 'unreachable') {
    return (
      <div className="state state--error" role="alert">
        <p>Slotkeeper is not reachable. Check that the service is running.</p>
        <button type="button" className="btn" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  if (status === 'signed-out') {
    document.title = 'Sign in · Slotkeeper';
    return <LoginPage />;
  }
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
);
