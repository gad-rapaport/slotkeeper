# Animation brief

## Purpose and audience

A 20-second film for the portfolio page and README that shows the moment Slotkeeper exists for: two people
booking the same slot at the same instant. Audience: interviewers for backend roles who want to see what the
concurrency work buys a user. It must work without sound.

## Core message

When two requests race for one slot, the database lets exactly one in; the other gets a clear 409 and finds a
free slot. Thirty requests at once still produce one booking and no unexpected responses.

## Reference and what was taken from it

The local reference video (an illustrated product film, stored rotated by 90 degrees and viewed in the correct
orientation frame by frame; not included here) moves from a person with a need to a screen, into an abstract
space where objects travel and are sorted, and back to the person for the result. Adapted for Slotkeeper:

| Reference element                                     | Here                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Person with a need in a simple line-drawn environment | Two monoline colleagues at desks, both wanting Yarkon room at 09:00              |
| Push into the device and a UI action                  | The real booking dialog on a laptop; two cursors press Book together             |
| Objects leaving the screen and travelling             | Two `POST /api/bookings` tokens fly from the Book button to the timeline         |
| Objects being sorted in an abstract space             | The timeline accepts one token (slot locks with a padlock), turns the other away |
| Return to the people for the result                   | Both have a confirmed slot card                                                  |

Not taken: any character, brand, layout, colour or asset of the reference. The drawing here is monoline (ink
outlines, one accent fill per person) with a timeline and padlocks, unlike the other films in the portfolio.

## Duration and format

20.0 s, 1920x1080, 30 fps, H.264 (yuv420p, BT.709, faststart), no audio.

## Palette and typography

Slotkeeper tokens: background `#f6f6fb`, ink `#1c1b3a`, indigo `#4338ca` (Maya, "Yours"), teal `#0e7c66`
(Omer), free `#e6f5ec` with `#1d6440`, taken as a grey hatch like the app's schedule, conflict red `#9b1c1c` on
`#fdecec`. Manrope 400/800 and JetBrains Mono 500, from the web app's font packages.

## Motion language

Line and shape: tokens travel on eased arcs (`inOutCubic`), arrivals settle with `outBack`, padlock shackles
close with a small overshoot, the rejected token bounces up and slides to the next free slot. The thirty-request
beat is a short shower onto one slot: one sticks, the rest bounce off. No flashes, no camera shake.

## Scenes

| #   | Time       | Content                                                                                                                                              | Capability                                      |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | 0-3.9      | Maya and Omer at desks, both wanting Yarkon room at 09:00; office clock labelled Israel time (GMT+3)                                                 | The need; office time zones                     |
| 2   | 3.9-8.3    | Laptop with the real booking dialog screenshot; two cursors press Book together; two request tokens leave                                            | Booking flow                                    |
| 3   | 8.3-12.9   | Day timeline 08:00-19:00 with the screenshot's taken blocks; Maya's token locks 09:00-09:30; Omer's gets the app's 409 message and books 10:15-10:45 | Exclusion constraint, clean 409, next free slot |
| 4   | 12.9-15.35 | Thirty requests onto one slot; tally 30 / 1 / 29 / 0                                                                                                 | Contention simulation result                    |
| 5   | 15.4-17.9  | Both colleagues with a confirmed slot card                                                                                                           | Outcome                                         |
| 6   | 17.8-20.0  | Mark, name, tagline, repository                                                                                                                      | Brand                                           |

Timing per element: [ANIMATION-STORYBOARD.md](ANIMATION-STORYBOARD.md).

## On-screen text

"Two people. One room. The same 09:00." / "Both press Book at the same moment." / "The database lets exactly
one in." / "The other gets a clear answer and a free slot." / "30 requests at once: one booking, no errors." /
"No double bookings. No surprises." / "Slotkeeper" / "Book rooms, desks and equipment without double bookings" /
repository.

## Assets and sources

| Asset                        | Source                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Laptop screen                | `docs/screenshots/booking-dialog.png`, captured from the running app with seed data  |
| Taken blocks on the timeline | The same day as the screenshot (08:30-09:00, 09:30-10:15, 13:30-15:00)               |
| 409 wording                  | The API's conflict message in `server/src/modules/reservations/service.ts`           |
| 30 / 1 / 29 / 0              | Output of `scripts/simulate-contention.mjs` against the local stack (also run in CI) |
| Constraint line              | `migrations/001_init.sql`                                                            |
| Legend                       | The app's colour key (Free, Taken, Yours)                                            |
| Everything else              | Original SVG in [animation/scene.js](../animation/scene.js)                          |
| Fonts                        | Manrope and JetBrains Mono (SIL OFL)                                                 |
| Music                        | None                                                                                 |

Names (Maya, Omer) are invented for the illustration; they are not seed accounts or real people.

## Production

Same pipeline as the other portfolio films: SVG scene, deterministic `seek(t)`, Playwright frame capture,
ffmpeg encode; nothing in the app image. See [ANIMATION-RENDERING.md](ANIMATION-RENDERING.md).

## Acceptance checks

Reviewed from start to end on contact sheets and per-transition frame sheets. Fixed before the final render:
the timeline appearing over the fading laptop, the padlock covering the timeline title, the 409 card touching
the moving token, the thirty-request tally overlapping the people scene, and wording that differed from the
API's message. Every capability shown is implemented and tested (integration tests for overlap, 409 and
idempotency; the contention simulation; E2E booking flow). No personal data.
