# Slim configuration

The default stack is Slim; one image, one code base.

| Setting         | Value                                                        | Measured 2026-10-04               |
| --------------- | ------------------------------------------------------------ | --------------------------------- |
| Image           | distroless Node 24, production dependencies                  | 245 MB unpacked, 58 MB compressed |
| App             | 256 MB limit, heap 160 MB, pool 8                            | 47 MiB idle after tests           |
| Database        | 256 MB limit, `shared_buffers=48MB`, 20 connections          | 43 MiB                            |
| Demo data       | 2 sites, 9 resources, 13 users, 177 reservations             |                                   |
| Background work | One hourly purge                                             |                                   |
| Browser         | No polling; schedule reloads on navigation and after actions |                                   |

Development uses `compose.dev.yaml` (database only, port 54103, separate volume). The public profile is
`compose.prod.yaml`. No optional services exist; the seed runs only on demand through the `tools` profile.
