import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api, ApiError, toApiError } from '../api/client';
import type { Availability, Day, Reservation } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { ErrorBox, Loading } from '../components/Shell';
import { useToast } from '../components/Toast';
import { useResource } from '../hooks/useResource';
import {
  addMinutes,
  blocks,
  durationOptions,
  formatDate,
  formatMinutes,
  shiftDate,
  zoneLabel,
} from '../lib/schedule';

interface Pending {
  day: Day;
  slotIndex: number;
}

export function ResourcePage() {
  const { id = '' } = useParams();
  const user = useUser();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'week' ? 'week' : 'day';
  const dateParam = params.get('date');
  const avail = useResource(
    (signal) =>
      api<Availability>(`/api/resources/${id}/availability`, {
        signal,
        query: { date: dateParam ?? undefined, days: view === 'week' ? 7 : 1 },
      }),
    [id, dateParam, view],
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  if (avail.status === 'error' && !avail.data) return <ErrorBox error={avail.error} onRetry={avail.reload} />;
  if (!avail.data) return <Loading label="Loading schedule" />;
  const { resource, today, days } = avail.data;
  const date = dateParam ?? today;

  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to={`/?site=${resource.siteId}`}>{resource.siteName}</Link> <span aria-hidden="true">/</span>{' '}
        {resource.name}
      </nav>
      <header className="page-head page-head--row">
        <div>
          <h1>{resource.name}</h1>
          <p className="muted">
            {resource.description} Book in {resource.slotMinutes}-minute steps,{' '}
            {formatMinutes(resource.minMinutes)} to {formatMinutes(resource.maxMinutes)}. Times in{' '}
            <strong>{zoneLabel(resource.timezone)}</strong>.
          </p>
        </div>
        {user.role === 'admin' && (
          <button type="button" className="btn" onClick={() => setMaintenanceOpen(true)}>
            Schedule maintenance
          </button>
        )}
      </header>

      {notice && (
        <div className="alert alert--warn" role="alert">
          <p>{notice}</p>
          <button type="button" className="link-btn" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="toolbar">
        <div className="toolbar__dates" role="group" aria-label="Choose date">
          <button
            type="button"
            className="btn btn--icon"
            onClick={() => set({ date: shiftDate(date, view === 'week' ? -7 : -1) })}
            aria-label={view === 'week' ? 'Previous week' : 'Previous day'}
          >
            ‹
          </button>
          <label className="date-input">
            <span className="visually-hidden">Date</span>
            <input
              type="date"
              value={date}
              min={shiftDate(today, -7)}
              onChange={(e) => e.target.value && set({ date: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="btn btn--icon"
            onClick={() => set({ date: shiftDate(date, view === 'week' ? 7 : 1) })}
            aria-label={view === 'week' ? 'Next week' : 'Next day'}
          >
            ›
          </button>
          {date !== today && (
            <button type="button" className="btn btn--quiet" onClick={() => set({ date: null })}>
              Today
            </button>
          )}
        </div>
        <div className="seg seg--inline" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'day'} onClick={() => set({ view: null })}>
            Day
          </button>
          <button type="button" aria-pressed={view === 'week'} onClick={() => set({ view: 'week' })}>
            Week
          </button>
        </div>
      </div>

      <div
        aria-busy={avail.status === 'loading'}
        className={avail.status === 'loading' ? 'is-loading' : undefined}
      >
        {view === 'day' ? (
          <DayView day={days[0]!} onPick={(slotIndex) => setPending({ day: days[0]!, slotIndex })} />
        ) : (
          <WeekView days={days} onOpen={(d) => set({ date: d, view: null })} />
        )}
      </div>

      <BookingDialog
        pending={pending}
        rules={resource}
        resourceId={resource.id}
        resourceName={resource.name}
        onClose={() => setPending(null)}
        onBooked={(r) => {
          setPending(null);
          setNotice(null);
          toast(`Booked ${r.resourceName}, ${formatDate(r.localDate)} ${r.localStart}-${r.localEnd}.`);
          avail.reload();
        }}
        onConflict={(message) => {
          setPending(null);
          setNotice(message);
          avail.reload();
        }}
      />
      {user.role === 'admin' && (
        <MaintenanceDialog
          open={maintenanceOpen}
          day={days[0]!}
          resourceId={resource.id}
          onClose={() => setMaintenanceOpen(false)}
          onDone={() => {
            setMaintenanceOpen(false);
            toast('Maintenance scheduled.');
            avail.reload();
          }}
        />
      )}
    </div>
  );
}

function reservationLabel(r: Reservation | undefined, state: string): string {
  if (state === 'maintenance') return `Maintenance${r?.title ? `: ${r.title}` : ''}`;
  if (state === 'mine') return `Your booking${r?.title ? `: ${r.title}` : ''}`;
  return 'Booked';
}

function DayView({ day, onPick }: { day: Day; onPick: (slotIndex: number) => void }) {
  const list = useMemo(() => blocks(day), [day]);
  if (!day.open) {
    return (
      <section className="day" aria-label={formatDate(day.date, day.weekday)}>
        <h2 className="day__title">{formatDate(day.date, day.weekday)}</h2>
        <p className="state">Closed on this day.</p>
      </section>
    );
  }
  const freeCount = day.slots.filter((s) => s.state === 'free').length;
  return (
    <section className="day" aria-labelledby="day-title">
      <h2 className="day__title" id="day-title">
        {formatDate(day.date, day.weekday)}
        <span className="muted small">
          {' '}
          open {day.opens}-{day.closes} · {freeCount} free slot{freeCount === 1 ? '' : 's'}
          {day.dayLengthHours !== 24 && ` · clocks change today (${day.dayLengthHours}-hour day)`}
        </span>
      </h2>
      <ol className="timeline">
        {list.map((b, i) => {
          const from = b.slots[0]!.localStart;
          const lastSlot = b.slots.at(-1)!;
          const until =
            b.type === 'reserved' && b.reservation ? b.reservation.localEnd : endLabel(day, lastSlot.end);
          if (b.type === 'past') {
            return (
              <li key={i} className="row row--past">
                <span className="row__time">
                  {from}-{until}
                </span>
                <span>Past</span>
              </li>
            );
          }
          if (b.type === 'reserved') {
            return (
              <li key={i} className={`row row--${b.state}`}>
                <span className="row__time">
                  {b.reservation?.localStart ?? from}-{until}
                </span>
                <span className="row__label">
                  <span className="row__tag">
                    {b.state === 'maintenance' ? 'Blocked' : b.state === 'mine' ? 'Yours' : 'Taken'}
                  </span>
                  {reservationLabel(b.reservation, b.state)}
                  {b.state === 'mine' && (
                    <Link to="/bookings" className="small">
                      {' '}
                      Change
                    </Link>
                  )}
                </span>
              </li>
            );
          }
          return (
            <li key={i} className="row row--free">
              <span className="row__time">
                {from}-{until}
              </span>
              <span className="row__label">
                <span className="row__tag">Free</span>
                <span
                  className="slots"
                  role="group"
                  aria-label={`Free from ${from} to ${until}. Choose a start time`}
                >
                  {b.slots.map((s) => (
                    <button
                      key={s.start}
                      type="button"
                      className="slot-btn"
                      onClick={() => onPick(day.slots.indexOf(s))}
                    >
                      {s.localStart}
                    </button>
                  ))}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function endLabel(day: Day, endIso: string): string {
  const next = day.slots.find((s) => s.start === endIso);
  return next ? next.localStart : (day.closes ?? '');
}

function WeekView({ days, onOpen }: { days: Day[]; onOpen: (date: string) => void }) {
  return (
    <>
      <ul className="legend" aria-label="Colour key">
        <li>
          <span className="strip strip--free" aria-hidden="true" /> Free
        </li>
        <li>
          <span className="strip strip--booked" aria-hidden="true" /> Taken
        </li>
        <li>
          <span className="strip strip--mine" aria-hidden="true" /> Yours
        </li>
        <li>
          <span className="strip strip--maintenance" aria-hidden="true" /> Maintenance
        </li>
        <li>
          <span className="strip strip--past" aria-hidden="true" /> Past
        </li>
      </ul>
      <ul className="week">
        {days.map((d) => {
          const free = d.slots.filter((s) => s.state === 'free').length;
          const total = d.slots.length;
          return (
            <li key={d.date} className="week__day">
              <button type="button" className="week__btn" onClick={() => onOpen(d.date)}>
                <span className="week__date">{formatDate(d.date, d.weekday)}</span>
                {d.open ? (
                  <>
                    <span className="week__strip" aria-hidden="true">
                      {d.slots.map((s) => (
                        <span key={s.start} className={`strip strip--${s.state}`} />
                      ))}
                    </span>
                    <span className="week__summary">
                      {free === 0 ? 'Fully booked' : `${free} of ${total} slots free`} · {d.opens}-{d.closes}
                    </span>
                  </>
                ) : (
                  <span className="week__summary muted">Closed</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function newKey(): string {
  return crypto.randomUUID();
}

function BookingDialog({
  pending,
  rules,
  resourceId,
  resourceName,
  onClose,
  onBooked,
  onConflict,
}: {
  pending: Pending | null;
  rules: { slotMinutes: number; minMinutes: number; maxMinutes: number };
  resourceId: string;
  resourceName: string;
  onClose: () => void;
  onBooked: (r: Reservation) => void;
  onConflict: (message: string) => void;
}) {
  const slot = pending ? pending.day.slots[pending.slotIndex] : undefined;
  return (
    <Dialog open={Boolean(pending)} title={`Book ${resourceName}`} onClose={onClose}>
      {pending && slot && (
        <BookingForm
          key={slot.start}
          day={pending.day}
          slotIndex={pending.slotIndex}
          rules={rules}
          resourceId={resourceId}
          onBooked={onBooked}
          onConflict={onConflict}
        />
      )}
    </Dialog>
  );
}

function BookingForm({
  day,
  slotIndex,
  rules,
  resourceId,
  onBooked,
  onConflict,
}: {
  day: Day;
  slotIndex: number;
  rules: { slotMinutes: number; minMinutes: number; maxMinutes: number };
  resourceId: string;
  onBooked: (r: Reservation) => void;
  onConflict: (message: string) => void;
}) {
  const slot = day.slots[slotIndex]!;
  const options = durationOptions(day, slotIndex, rules);
  const [minutes, setMinutes] = useState(options.find((m) => m >= 60) ?? options.at(-1) ?? rules.minMinutes);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per booking attempt: a retry after a network failure reuses it, so it cannot create a second booking.
  const [key] = useState(newKey);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<Reservation>('/api/bookings', {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: { resourceId, start: slot.start, end: addMinutes(slot.start, minutes), title },
      });
      onBooked(r);
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.code === 'SLOT_TAKEN') onConflict(apiErr.message);
      else
        setError(
          apiErr.code === 'NETWORK' ? `${apiErr.message} Pressing Book again is safe.` : apiErr.message,
        );
      setBusy(false);
    }
  }

  if (options.length === 0) {
    return (
      <p className="form-pad">
        There is not enough free time from {slot.localStart} for the minimum booking of{' '}
        {formatMinutes(rules.minMinutes)}. Choose an earlier start.
      </p>
    );
  }
  const endIso = addMinutes(slot.start, minutes);
  const endLocal = day.slots.find((s) => s.start === endIso)?.localStart ?? day.closes;
  return (
    <form className="stack form-pad" onSubmit={submit}>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      <p className="summary-line">
        <strong>{formatDate(day.date, day.weekday)}</strong>, {slot.localStart} to <strong>{endLocal}</strong>
      </p>
      <Field label="Duration">
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {options.map((m) => (
            <option key={m} value={m}>
              {formatMinutes(m)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title" hint="Optional. Only you and admins can see it.">
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? 'Booking…' : 'Book'}
      </button>
    </form>
  );
}

function MaintenanceDialog({
  open,
  day,
  resourceId,
  onClose,
  onDone,
}: {
  open: boolean;
  day: Day;
  resourceId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const starts = day.slots;
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(Math.min(3, Math.max(0, starts.length - 1)));
  const [reason, setReason] = useState('');
  const [cancelConflicting, setCancel] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/resources/' + resourceId + '/maintenance', {
        method: 'POST',
        body: { start: starts[from]!.start, end: starts[to]!.end, reason, cancelConflicting },
      });
      onDone();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const conflicts = (error?.details?.conflicts as Reservation[] | undefined) ?? [];
  return (
    <Dialog open={open} title={`Maintenance on ${formatDate(day.date, day.weekday)}`} onClose={onClose}>
      {!day.open ? (
        <p className="form-pad">The site is closed on this day.</p>
      ) : (
        <form className="stack form-pad" onSubmit={submit}>
          {error && (
            <div className="alert alert--error" role="alert">
              <p>{error.message}</p>
              {conflicts.length > 0 && (
                <ul>
                  {conflicts.map((c) => (
                    <li key={c.id}>
                      {c.localStart}-{c.localEnd} {c.userName ?? ''} {c.title ? `(${c.title})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="row-2">
            <Field label="From">
              <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
                {starts.map((s, i) => (
                  <option key={s.start} value={i}>
                    {s.localStart}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Until">
              <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
                {starts.map((s, i) =>
                  i >= from ? (
                    <option key={s.end} value={i}>
                      {starts[i + 1]?.localStart ?? day.closes}
                    </option>
                  ) : null,
                )}
              </select>
            </Field>
          </div>
          <Field label="Reason" required>
            <input value={reason} minLength={3} maxLength={120} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={cancelConflicting}
              onChange={(e) => setCancel(e.target.checked)}
            />
            <span>Cancel overlapping bookings (they are cancelled together with creating the block)</span>
          </label>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy || reason.trim().length < 3 || to < from}
          >
            {busy ? 'Saving…' : 'Block this time'}
          </button>
        </form>
      )}
    </Dialog>
  );
}
