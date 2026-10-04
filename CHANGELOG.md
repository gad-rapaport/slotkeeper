# Changelog

## [0.1.0] - 2026-10-04

First complete release.

### Added

- Sites with IANA time zones and local opening hours; rooms, desks and equipment with step, minimum and
  maximum durations.
- Bookings and maintenance blocks in one table guarded by an exclusion constraint on half-open ranges.
- Idempotent booking creation, per-user limit, booking horizon, optimistic versions for change and cancel.
- Per-resource advisory lock, consistent lock order and bounded retries for deadlock victims.
- Day and week schedules, booking and reschedule dialogs, my bookings, activity log, admin maintenance with
  atomic cancellation of conflicts.
- OpenAPI 3.1 contract with a drift test; contention simulation script.
- Docker Compose stack, ops script, CI including the simulation, manual and disabled deploy workflow.
