# Testing

## Strategy

| Layer       | Tool                                    | Proves                                                                                                                               |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Unit        | Vitest                                  | Zone conversion including DST gaps and overlaps, 23/25-hour days, every booking-window rule, schedule grouping and duration options  |
| Integration | Vitest + Fastify inject + PostgreSQL 18 | Contention, idempotency, rules over HTTP, privacy, permissions, maintenance with atomic cancellation, activity log, OpenAPI contract |
| E2E         | Playwright + axe-core                   | Book, conflict message from a real second session, move and cancel, week view, admin-only controls, phone flow                       |
| Simulation  | `scripts/simulate-contention.mjs`       | The same guarantee against the running Docker stack, also run in CI                                                                  |

## Key scenarios

- **24 simultaneous requests for one slot** (8 users x 3): exactly one 201, 23 x 409 `SLOT_TAKEN`, one row.
- **16 staggered one-hour requests every 15 minutes**: no two active rows overlap (self-join check), only
  201/409 responses.
- **Per-user limit under parallel creation** (limit 3, 6 requests): exactly 3 succeed.
- **Bypass test:** inserting an overlap directly in SQL fails with `23P01 reservations_no_overlap`.
- **Half-open intervals:** back-to-back bookings both succeed. Cancelling frees the slot.
- **Idempotency:** sequential retry replays; 10 simultaneous retries create one row; reused key with a
  different body is 422; keys are per user; failed attempts are not remembered.
- **Time:** exact opening boundaries, alignment, length, direction, past, horizon, malformed or offset-less
  times; London rules evaluated in London time.
- **Contract:** documented routes exist, registered routes are documented, error codes match.

## Results (2026-10-04, local)

| Suite                          | Result                                                                     |
| ------------------------------ | -------------------------------------------------------------------------- |
| Unit                           | 20 passed                                                                  |
| Integration                    | 26 passed; repeated 6 times in a row without failure after the locking fix |
| E2E                            | 6 passed, repeated 3 times                                                 |
| Simulation on the Docker stack | 30 requests: 1 created, 29 x 409, 0 unexpected; total 338 ms               |

### Defects found by these tests

1. Deadlock between one user's parallel requests (user row locked after inserting a row referencing it).
   Fixed by locking the user first with `FOR NO KEY UPDATE`.
2. Intermittent `40P01` between different users' overlapping inserts in the exclusion index. Fixed by a
   per-resource advisory lock and bounded transaction retries. See [DECISIONS.md](DECISIONS.md#isolation-and-locking).

### Latency (60 sequential requests, Docker Desktop, 4-core laptop)

| Endpoint             | p50    | p95    |
| -------------------- | ------ | ------ |
| availability, 1 day  | 3.6 ms | 5.0 ms |
| availability, 7 days | 6.6 ms | 7.9 ms |
| my bookings          | 3.1 ms | 3.8 ms |

## Commands

```powershell
./scripts/ops.ps1 test
npm run test:e2e        # stack running; set LOGIN_RATE_LIMIT_PER_MINUTE=60 in .env for repeated runs
npm run simulate
```

## Gaps

No load test beyond the contention scenarios; E2E in Chromium only; no tests for the 25-hour day through the
UI (covered at unit level).
