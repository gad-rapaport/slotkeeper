# API

The full contract is [openapi.yaml](openapi.yaml) (OpenAPI 3.1), also served by the app at
`/api/openapi.yaml`. This page summarises the parts that matter most to a client.

## Conventions

- Session cookie `sk_session` from `POST /api/auth/login`; state-changing requests also send `X-CSRF-Token`.
- Times are ISO 8601 instants **with an offset**. Responses add `localDate`, `localStart`, `localEnd` in the
  site's zone.
- Errors: `{ "error": { "code", "message", "details" }, "requestId" }`.

| Status | Code                                            | When                                                                                                                                              |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED`, `IDEMPOTENCY_KEY_REQUIRED` | Malformed input; missing key on create                                                                                                            |
| 403    | `FORBIDDEN`, `CSRF_REJECTED`                    | Changing someone else's booking; maintenance as a member                                                                                          |
| 404    | `NOT_FOUND`                                     | Unknown resource; another member's booking                                                                                                        |
| 409    | `SLOT_TAKEN`                                    | Overlap; `details.conflicts` lists what is in the way                                                                                             |
| 409    | `VERSION_CONFLICT`                              | Stale `expectedVersion`; `details.current`                                                                                                        |
| 422    | `BOOKING_RULE`                                  | `details.rule`: `OUTSIDE_HOURS`, `NOT_ALIGNED`, `TOO_SHORT`, `TOO_LONG`, `IN_PAST`, `TOO_FAR_AHEAD`, `CLOSED_DAY`, `SPANS_DAYS`, `INVALID_PERIOD` |
| 422    | `IDEMPOTENCY_KEY_REUSED`, `LIMIT_REACHED`       | Key reused with a different body; too many upcoming bookings                                                                                      |
| 429    | `RATE_LIMITED`                                  | Sign-in or booking rate limit                                                                                                                     |

## Creating a booking safely

```bash
KEY=$(uuidgen)   # one key per user intent; reuse it for retries of the same intent
curl -b jar -H "x-csrf-token: $CSRF" -H "idempotency-key: $KEY" -H 'content-type: application/json' \
  -d '{"resourceId":"<id>","start":"2026-10-05T09:00:00+03:00","end":"2026-10-05T10:00:00+03:00"}' \
  http://127.0.0.1:8103/api/bookings
```

Sending the same request again returns the same booking with `Idempotent-Replayed: true`.

## Reading availability

`GET /api/resources/{id}/availability?date=2026-10-05&days=7` returns, per local day, the opening window,
`dayLengthHours` (23/24/25), a slot grid with states `free | booked | mine | maintenance | past`, and the
overlapping reservations (titles hidden unless they are yours or you are an admin).
