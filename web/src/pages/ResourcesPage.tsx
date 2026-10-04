import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import type { Kind, Resource, Site } from '../api/types';
import { Empty, ErrorBox, Loading } from '../components/Shell';
import { useResource } from '../hooks/useResource';
import { formatMinutes, zoneLabel } from '../lib/schedule';

const KINDS: { value: '' | Kind; label: string }[] = [
  { value: '', label: 'Everything' },
  { value: 'room', label: 'Rooms' },
  { value: 'desk', label: 'Desks' },
  { value: 'equipment', label: 'Equipment' },
];

export function ResourcesPage() {
  const [params, setParams] = useSearchParams();
  const sites = useResource((signal) => api<{ items: Site[] }>('/api/sites', { signal }), []);
  const siteId = params.get('site') ?? sites.data?.items[0]?.id ?? '';
  const kind = (params.get('kind') ?? '') as '' | Kind;
  const resources = useResource(
    (signal) =>
      api<{ items: Resource[] }>('/api/resources', {
        signal,
        query: { siteId: siteId || undefined, kind: kind || undefined },
      }),
    [siteId, kind],
  );
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const site = sites.data?.items.find((s) => s.id === siteId);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Find a space</h1>
        {site && (
          <p className="muted">
            Times at {site.name} are shown in {zoneLabel(site.timezone)}.
          </p>
        )}
      </header>
      {sites.status === 'error' && <ErrorBox error={sites.error} onRetry={sites.reload} />}
      {sites.data && (
        <div className="filters">
          <fieldset className="seg">
            <legend className="seg__legend">Office</legend>
            {sites.data.items.map((s) => (
              <label key={s.id}>
                <input
                  type="radio"
                  name="site"
                  checked={s.id === siteId}
                  onChange={() => set('site', s.id)}
                />
                <span>{s.name}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="seg">
            <legend className="seg__legend">Type</legend>
            {KINDS.map((k) => (
              <label key={k.value}>
                <input
                  type="radio"
                  name="kind"
                  checked={k.value === kind}
                  onChange={() => set('kind', k.value)}
                />
                <span>{k.label}</span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
      {resources.status === 'loading' && !resources.data && <Loading label="Loading spaces" />}
      {resources.status === 'error' && <ErrorBox error={resources.error} onRetry={resources.reload} />}
      {resources.data &&
        (resources.data.items.length === 0 ? (
          <Empty>Nothing of this type at this office.</Empty>
        ) : (
          <ul className="cards" aria-busy={resources.status === 'loading'}>
            {resources.data.items.map((r) => (
              <li key={r.id} className={`card card--${r.kind}`}>
                <p className="card__kind">{r.kind}</p>
                <h2 className="card__name">
                  <Link to={`/resources/${r.id}`}>{r.name}</Link>
                </h2>
                <p className="card__desc">{r.description}</p>
                <dl className="card__facts">
                  {r.capacity && (
                    <>
                      <dt>Seats</dt>
                      <dd>{r.capacity}</dd>
                    </>
                  )}
                  <dt>Bookable</dt>
                  <dd>
                    {formatMinutes(r.minMinutes)} to {formatMinutes(r.maxMinutes)}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
