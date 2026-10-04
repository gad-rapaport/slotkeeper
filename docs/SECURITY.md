# Security

Authentication, CSRF, headers, container hardening and secret handling are the same design as Fieldline
(server-side sessions with hashed tokens, Argon2id, per-session CSRF token plus Origin check, strict CSP,
distroless non-root read-only containers, database on an internal network). This page covers what differs.

## Threat model

| Asset              | Threat                                   | Mitigation                                                                                            | Residual risk                                                                                                       |
| ------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Schedule integrity | Double booking through races or retries  | Exclusion constraint, advisory lock, retries on deadlock, idempotency keys                            | None known for overlaps; integrity of other rules depends on the API path (seed scripts bypass the per-user limit). |
| Availability       | Hoarding: one user books everything      | Per-user limit of upcoming bookings (20), 60-day horizon, booking rate limit (30 per minute per user) | A determined user can still hold 20 slots.                                                                          |
| Privacy            | Learning who booked what                 | Titles and names hidden from other members in every response; other members' booking ids return 404   | Members can infer that someone is busy at a time (by design).                                                       |
| Authorisation      | Changing others' bookings or maintenance | Ownership checked in the service; maintenance admin-only; versions required                           |                                                                                                                     |
| Idempotency keys   | Replay across users                      | Keys scoped per user; body hash must match; 24-hour expiry                                            | A client that reuses keys across intents gets 422, not silent reuse.                                                |
| Abuse              | Large or malformed requests              | Zod validation, 64 KB body limit, 1-7 day availability window, date range limited to the horizon      |                                                                                                                     |

## Secrets

`POSTGRES_PASSWORD` and the two seed passwords live only in `.env` or are generated in CI. The running app
does not receive seed passwords.

## Scanning

Gitleaks (full history), `npm audit --omit=dev --audit-level=high`, Trivy report in CI; see Fieldline's
policy for why the image scan is report-only.

## Known limitations

No MFA; no admin UI for users or resources (seeded); activity log not protected by database permissions.
