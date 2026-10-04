# Exercises

## 1. Buffer time between bookings

Rooms need 10 minutes to reset. Option A: widen the stored range (`[start, end + 10 min)`) only in the
constraint via a generated column. Option B: check in `checkWindow`. Implement A in a new migration and explain
why B is insufficient under concurrency. **Verify:** a booking ending 10:00 blocks one starting 10:05; the
concurrency tests still pass.

## 2. Recurring weekly booking

Add `POST /api/bookings/series` creating up to 8 weekly occurrences in one transaction with one idempotency key.
Decide: all-or-nothing or partial with a report. **Verify:** integration test where the 3rd week is taken.

## 3. Per-resource limit

Members may hold at most one upcoming booking per desk. Enforce in the service under the existing locks.
**Verify:** parallel requests for two different slots of the same desk create one booking.

## 4. Admin role for a single site

Add `site_admin` scoped to one site. Touch [permissions.ts](../server/src/domain/permissions.ts), the
migration enum and the OpenAPI spec. **Verify:** the contract test and new permission tests pass.

## 5. Pipeline: fail on slow contention

Make the CI simulation fail if total time exceeds 2 s. **Verify:** observe the job duration in the summary.
