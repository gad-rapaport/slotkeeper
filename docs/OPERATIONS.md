# Operations

Health checks (`/healthz`, `/readyz`), structured logs with request ids, log rotation, restart policy and
`ops.ps1` verbs work as in Fieldline. Specific to Slotkeeper:

## Background jobs

| Job          | Schedule          | Effect                                                                                |
| ------------ | ----------------- | ------------------------------------------------------------------------------------- |
| Housekeeping | Hourly in the app | Deletes expired sessions and idempotency keys older than `IDEMPOTENCY_TTL_HOURS` (24) |

## Signals worth watching

- `409 SLOT_TAKEN` is normal user behaviour, logged at info level.
- Repeated `40P01` in logs would mean a new code path takes locks in a different order; the lock order is
  documented in [ARCHITECTURE.md](ARCHITECTURE.md#lock-order).
- `LIMIT_REACHED` spikes suggest the per-user limit is too low for real use.

## Backup and restore

```powershell
./scripts/ops.ps1 backup
./scripts/ops.ps1 restore backups/slotkeeper-YYYYMMDD-HHMMSS.dump -Yes
```

`pg_dump -Fc` and `pg_restore --clean --single-transaction` from a throwaway `postgres:18` container on the
internal network, with the app stopped during restore.

## Retention

| Data                              | Retention                |
| --------------------------------- | ------------------------ |
| Reservations, including cancelled | Kept (audit and history) |
| Activity log                      | Kept                     |
| Idempotency keys                  | 24 hours                 |
| Sessions                          | Until expiry (12 h)      |

## Troubleshooting

| Symptom                                                 | Check                                                   | Fix                                                              |
| ------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| Nothing is bookable                                     | Is the office closed that day? Week view shows "Closed" | Choose another day                                               |
| "Bookings must fall within opening hours" near midnight | Site time zone vs your own                              | The UI states the zone; times are always the office's            |
| Simulation reports `LIMIT_REACHED`                      | Seeded accounts with many bookings                      | `ops.ps1 reset-demo -Yes` or use fewer accounts                  |
| 429 on sign-in during E2E                               | Login rate limit                                        | `LOGIN_RATE_LIMIT_PER_MINUTE=60` in `.env`, then `ops.ps1 start` |
