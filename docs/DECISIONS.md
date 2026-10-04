# Decisions

## Exclusion constraint as the guarantee

- **Chosen:** `EXCLUDE USING gist (resource_id WITH =, period WITH &&) WHERE (status = 'active')`.
- **Alternatives:** check-then-insert in the application (races between the check and the insert);
  `SERIALIZABLE` with an overlap query (correct, but every caller needs retry loops and false conflicts appear
  under load); a slot table with one row per 15 minutes and a unique key (simple, but couples storage to slot
  size and makes long bookings many rows).
- **Why:** the rule "no overlap" is declared once, next to the data, and holds for every writer including
  scripts and future services.

## Isolation and locking

`READ COMMITTED` plus explicit locks:

| Lock                               | Protects                                            | Why not something else                                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users ... FOR NO KEY UPDATE`      | Per-user booking limit; same-key idempotent retries | `FOR UPDATE` conflicts with the `KEY SHARE` locks foreign keys take, which caused deadlocks between a user's parallel requests during testing. Taking the lock first, before inserting rows that reference the user, removed them.            |
| `pg_advisory_xact_lock(resource)`  | Orderly contention on one resource                  | Concurrent overlapping inserts can deadlock inside the exclusion index: each inserts its entry, then waits for the other's outcome. PostgreSQL aborts one (`40P01`). The staggered-overlap test produced such 500s until this lock was added. |
| Retry on `40P01` / `40001` (max 3) | Any remaining deadlock or serialization failure     | Correct response to an aborted victim; bounded so a pathological case still fails.                                                                                                                                                            |

Measured effect: the 16-request staggered test went from intermittent 500 responses (2 of 6 full runs) to 0
failures in 6 consecutive full runs plus repeated E2E and simulation runs.

## Idempotency keys stored only for successes

- A failed create (409, 422) rolls back, including the key. Retrying the same key re-evaluates the request, so
  a slot that became free meanwhile can still be booked. Storing failures would freeze an outdated answer.
- Keys are scoped per user and kept 24 hours.

## Optimistic versions on change and cancel

Reschedule and cancel send `expectedVersion`, like Fieldline: a stale tab is told rather than overwriting.

## Privacy of other bookings

Members see that a slot is taken but not by whom or why (`title` and `userName` are null). Admins see details.
The rule lives in one policy function used by every response.

## Hand-written OpenAPI with a contract test

- **Chosen:** [docs/openapi.yaml](openapi.yaml) written by hand.
- **Alternative:** generate the spec from route schemas.
- **Why:** the spec doubles as documentation with prose on concurrency and idempotency. A test checks that
  every documented route exists, every registered route is documented, and the error code list matches the
  code, so drift fails CI.

## Opening hours in local time, stored per site

Offices define hours like "08:00-19:00, Sunday to Thursday" (Tel Aviv) or "09:00-18:00, Monday to Friday"
(London). Storing local times and converting per date handles daylight saving correctly; storing UTC hours
would be wrong for half the year.

## No drag and drop

Selecting a start time and a duration works the same with mouse, touch and keyboard, and is easier to make
accessible than dragging on a grid.
