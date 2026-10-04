# Storage

Measured 2026-10-04.

| Item                             | Size                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| `slotkeeper:local` image         | 245 MB unpacked, 58 MB compressed (base layers shared with Fieldline) |
| `postgres:18` image              | shared with Fieldline                                                 |
| `slotkeeper_db-data` volume      | 67 MB                                                                 |
| `slotkeeper-dev_dev-data` volume | 76 MB                                                                 |

Reservations are kept (including cancelled ones) for history; idempotency keys expire after 24 hours.
`./scripts/ops.ps1 reset-demo -Yes` replaces data in place. Removing everything:
`docker compose down -v` and `docker compose -f compose.dev.yaml down -v`. Rebuildable: `node_modules/`,
`dist/`, `playwright-report/`, `test-results/`.
