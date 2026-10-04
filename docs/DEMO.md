# Demo script (4 minutes)

Before: `./scripts/ops.ps1 reset-demo -Yes`; open http://127.0.0.1:8103 in two windows (one private). Have a
terminal ready in the repository.

1. **The rule (20 s).** "One resource, one booking at a time, across offices in different zones."
2. **Book (45 s).** As `demo@slotkeeper.test`: Tel Aviv HQ, Yarkon room, next day, tap a free time, keep one
   hour, Book. Point at the zone label and the "Yours" row.
3. **Lose a race (45 s).** In both windows open the same free slot of Carmel room (second window as admin).
   Book in the admin window, then press Book in the first: "no longer free", schedule refreshed.
4. **Prove it (60 s).** Run `npm run simulate`: 30 simultaneous requests, 1 created, 29 conflicts, 0 errors.
   Open [concurrency.test.ts](../tests/integration/concurrency.test.ts) and the exclusion constraint in the
   migration.
5. **Explain the locks (45 s).** [DECISIONS.md#isolation-and-locking](DECISIONS.md#isolation-and-locking): the
   two deadlocks the tests found and why the fixes are a lock order and an advisory lock, not `SERIALIZABLE`.
6. **Close (15 s).** OpenAPI contract and its drift test.

## Limitations and next steps

No recurring bookings, no calendar invites, seeded catalogue. Next: recurring series with per-occurrence
conflict reporting, iCal feed, resource management UI.
