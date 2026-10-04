import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { api, toApiError } from '../api/client';
import type { ActivityEntry, Availability, Reservation } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { Empty, ErrorBox, Loading } from '../components/Shell';
import { useToast } from '../components/Toast';
import { useResource } from '../hooks/useResource';
import { addMinutes, durationOptions, formatDate, formatMinutes } from '../lib/schedule';

export function BookingsPage() {
  const toast = useToast();
  const upcoming = useResource((signal) => api<{ items: Reservation[] }>('/api/bookings', { signal }), []);
  const past = useResource(
    (signal) => api<{ items: Reservation[] }>('/api/bookings', { signal, query: { scope: 'past' } }),
    [],
  );
  const [moving, setMoving] = useState<Reservation | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function cancel(r: Reservation) {
    setBusy(true);
    try {
      await api(`/api/bookings/${r.id}/cancel`, { method: 'POST', body: { expectedVersion: r.version } });
      toast(`Cancelled ${r.resourceName}, ${formatDate(r.localDate)} ${r.localStart}.`);
      setConfirming(null);
      upcoming.reload();
      past.reload();
    } catch (err) {
      toast(toApiError(err).message, 'error');
      upcoming.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>My bookings</h1>
      </header>
      <section aria-labelledby="up-h">
        <h2 id="up-h" className="section-title">
          Upcoming
        </h2>
        {upcoming.status === 'error' && <ErrorBox error={upcoming.error} onRetry={upcoming.reload} />}
        {!upcoming.data && upcoming.status === 'loading' && <Loading label="Loading bookings" />}
        {upcoming.data &&
          (upcoming.data.items.length === 0 ? (
            <Empty>
              No upcoming bookings. <Link to="/">Find a space</Link>.
            </Empty>
          ) : (
            <ul className="bookings">
              {upcoming.data.items.map((r) => (
                <li key={r.id} className="booking">
                  <div className="booking__when">
                    <span className="booking__date">{formatDate(r.localDate)}</span>
                    <span className="booking__time">
                      {r.localStart}-{r.localEnd}
                    </span>
                  </div>
                  <div className="booking__what">
                    <Link to={`/resources/${r.resourceId}?date=${r.localDate}`}>{r.resourceName}</Link>
                    <span className="muted small">
                      {r.siteName}
                      {r.title ? ` · ${r.title}` : ''}
                    </span>
                  </div>
                  <div className="booking__actions">
                    {confirming === r.id ? (
                      <>
                        <button
                          type="button"
                          className="btn btn--danger"
                          disabled={busy}
                          onClick={() => void cancel(r)}
                        >
                          Confirm cancel
                        </button>
                        <button type="button" className="btn btn--quiet" onClick={() => setConfirming(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn" onClick={() => setMoving(r)}>
                          Change time
                        </button>
                        <button
                          type="button"
                          className="btn btn--quiet"
                          onClick={() => setConfirming(r.id)}
                          aria-label={`Cancel ${r.resourceName} on ${formatDate(r.localDate)} at ${r.localStart}`}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section aria-labelledby="past-h">
        <h2 id="past-h" className="section-title">
          Past and cancelled
        </h2>
        {past.data &&
          (past.data.items.length === 0 ? (
            <Empty>Nothing yet.</Empty>
          ) : (
            <ul className="bookings bookings--past">
              {past.data.items.slice(0, 20).map((r) => (
                <li key={r.id} className="booking">
                  <div className="booking__when">
                    <span className="booking__date">{formatDate(r.localDate)}</span>
                    <span className="booking__time">
                      {r.localStart}-{r.localEnd}
                    </span>
                  </div>
                  <div className="booking__what">
                    {r.resourceName}
                    <span className="muted small">
                      {r.status === 'cancelled' ? 'Cancelled' : 'Completed'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <Dialog
        open={moving !== null}
        title={moving ? `Change ${moving.resourceName}` : ''}
        onClose={() => setMoving(null)}
      >
        {moving && (
          <RescheduleForm
            key={moving.id}
            booking={moving}
            onDone={(r) => {
              setMoving(null);
              toast(`Moved to ${formatDate(r.localDate)} ${r.localStart}-${r.localEnd}.`);
              upcoming.reload();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function RescheduleForm({ booking, onDone }: { booking: Reservation; onDone: (r: Reservation) => void }) {
  const [date, setDate] = useState(booking.localDate);
  const avail = useResource(
    (signal) =>
      api<Availability>(`/api/resources/${booking.resourceId}/availability`, { signal, query: { date } }),
    [date],
  );
  const [startIndex, setStartIndex] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const day = avail.data?.days[0];
  const rules = avail.data?.resource;
  const starts = day
    ? day.slots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.state === 'free' || s.reservationId === booking.id)
    : [];
  const chosen =
    startIndex ?? starts.find(({ s }) => s.localStart === booking.localStart)?.i ?? starts[0]?.i ?? null;
  const options = day && rules && chosen !== null ? durationOptions(day, chosen, rules, booking.id) : [];
  const originalMinutes = (new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60_000;
  const length =
    minutes !== null && options.includes(minutes)
      ? minutes
      : options.includes(originalMinutes)
        ? originalMinutes
        : options[0];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!day || chosen === null || !length) return;
    setBusy(true);
    setError(null);
    try {
      const start = day.slots[chosen]!.start;
      const r = await api<Reservation>(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        body: { expectedVersion: booking.version, start, end: addMinutes(start, length) },
      });
      onDone(r);
    } catch (err) {
      setError(toApiError(err).message);
      avail.reload();
      setBusy(false);
    }
  }

  return (
    <form className="stack form-pad" onSubmit={submit}>
      <p className="muted small">
        Currently {formatDate(booking.localDate)}, {booking.localStart}-{booking.localEnd}.
      </p>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      <Field label="Date">
        <input
          type="date"
          value={date}
          onChange={(e) => {
            if (!e.target.value) return;
            setDate(e.target.value);
            setStartIndex(null);
          }}
        />
      </Field>
      {avail.status === 'loading' && !day && <p className="muted">Checking availability…</p>}
      {day && !day.open && <p className="alert alert--warn">The office is closed on this day.</p>}
      {day && day.open && starts.length === 0 && (
        <p className="alert alert--warn">No free time on this day.</p>
      )}
      {day && starts.length > 0 && (
        <div className="row-2">
          <Field label="Start">
            <select value={chosen ?? ''} onChange={(e) => setStartIndex(Number(e.target.value))}>
              {starts.map(({ s, i }) => (
                <option key={s.start} value={i}>
                  {s.localStart}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duration">
            <select
              value={length ?? ''}
              onChange={(e) => setMinutes(Number(e.target.value))}
              disabled={options.length === 0}
            >
              {options.length === 0 && <option value="">Not enough time</option>}
              {options.map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <button type="submit" className="btn btn--primary" disabled={busy || !length}>
        {busy ? 'Saving…' : 'Move booking'}
      </button>
    </form>
  );
}

export function ActivityPage() {
  const user = useUser();
  const [all, setAll] = useState(false);
  const res = useResource(
    (signal) =>
      api<{ items: ActivityEntry[] }>('/api/activity', { signal, query: { all: all ? 'true' : undefined } }),
    [all],
  );
  const fmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="page">
      <header className="page-head page-head--row">
        <h1>Activity</h1>
        {user.role === 'admin' && (
          <label className="check">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            <span>Show everyone</span>
          </label>
        )}
      </header>
      {res.status === 'error' && <ErrorBox error={res.error} onRetry={res.reload} />}
      {!res.data && res.status === 'loading' && <Loading label="Loading activity" />}
      {res.data &&
        (res.data.items.length === 0 ? (
          <Empty>No activity yet.</Empty>
        ) : (
          <table className="table">
            <caption className="visually-hidden">Recent changes, newest first</caption>
            <thead>
              <tr>
                <th scope="col">When (your time)</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
              </tr>
            </thead>
            <tbody>
              {res.data.items.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{fmt.format(new Date(a.createdAt))}</td>
                  <td>{a.actorName ?? 'System'}</td>
                  <td>
                    {a.summary}
                    <span className="muted small block mono">{a.action}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </div>
  );
}
