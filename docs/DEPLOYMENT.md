# Deployment

Same pipeline shape as Fieldline:

- Multi-stage build to `gcr.io/distroless/nodejs24-debian12:nonroot`; the OpenAPI file is copied into the
  image and served at `/api/openapi.yaml`.
- [compose.yaml](../compose.yaml): app on `127.0.0.1:8103`, PostgreSQL on an internal network, limits
  1 CPU / 256 MB / 100 PIDs each, read-only root filesystems, dropped capabilities, `restart: on-failure:3`.
- [compose.prod.yaml](../compose.prod.yaml): pinned image digest, secure cookies, proxy trust.

## CI

[ci.yml](../.github/workflows/ci.yml): lint, format, types, unit; integration against a PostgreSQL 18 service
container; image build, E2E, **contention simulation against the running stack**, image size and Trivy report;
gitleaks and npm audit. Read-only permissions, SHA-pinned actions, cancellation of superseded runs.

## CD (prepared, disabled)

[deploy.yml](../.github/workflows/deploy.yml) publishes a SHA-tagged image only when started by hand; the deploy
job needs `DEPLOY_ENABLED=true` and an approved `demo` environment, neither configured.
[deploy/deploy.sh](../deploy/deploy.sh) deploys a pinned digest and rolls back automatically if unhealthy.
Verified: production override resolves. Not verified: publish, SSH deploy, remote smoke test.

## Rollback

Image rollback through `deploy.sh --rollback`; data stays in the volume. Schema changes must be additive to
roll back across them; take a backup before any deploy with a migration.
