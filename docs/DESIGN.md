# Design

## Identity

A calm scheduling tool: cool off-white, deep indigo ink and an indigo accent, with the schedule itself as the
visual centre. Free time is green and inviting, other people's bookings are muted and hatched, your own are
solid indigo, maintenance is amber and hatched. The logo is a rounded square holding three time bars.

## Typography

**Manrope** for interface text: geometric, open and friendly, with clear numerals at small sizes and a strong
800 weight for headings. **JetBrains Mono** for times, so `09:15` and `10:45` align in columns and slot buttons
have equal width. Latin subsets only, served locally.

## Colour and contrast (WCAG 2.2 AA)

| Pair                                         | Ratio     |
| -------------------------------------------- | --------- |
| Text `#1c1b3a` on background `#f6f6fb`       | 15.4      |
| Muted `#5a5878` on white / background        | 6.8 / 6.3 |
| White on accent `#4338ca`                    | 7.9       |
| Link `#312a9c` on white                      | 10.8      |
| Free label `#1d6440` on `#e6f5ec` / on white | 6.3 / 7.1 |
| Taken label `#4b4966` on `#eceaf3`           | 7.2       |
| Maintenance `#77490a` on `#fcefd2`           | 6.7       |
| Error `#9b1c1c` on `#fdecec`                 | 7.1       |
| Accent `#4338ca` on `#eceefe`                | 6.9       |

States are never colour-only: every schedule row has a text tag (Free, Taken, Yours, Blocked) and a label;
taken and maintenance rows also use a hatch pattern; the week strip has a colour key and a text summary
("12 of 44 slots free").

## Interaction decisions

- **Tap a start time, then choose a duration.** No dragging, so it works with touch, mouse, keyboard and
  screen readers alike. Duration options stop at the next taken slot and at the resource's maximum.
- **Default duration one hour** where possible; the end time is shown before confirming.
- **Conflicts explain and refresh:** if someone else booked first, the dialog closes, a message names the
  conflicting time and the schedule reloads.
- **Time zone always visible** on the spaces page and the schedule ("Israel time (GMT+3)").
- **Idempotency in the UI:** one key per booking dialog, so pressing Book again after a network error cannot
  create a second booking.

## Responsive behaviour

Desktop: horizontal rows with time column. Below 760 px: rows stack, slot buttons wrap, the week view becomes a
list of day cards, navigation moves to a scrollable second line. E2E asserts no horizontal scrolling on a phone.

## Accessibility

Skip link, focus moved to the main region on navigation, native `<dialog>`, labelled controls, `aria-pressed` on
view toggles, group labels on slot button sets ("Free from 16:00 to 19:00. Choose a start time"), visible focus,
reduced motion respected. axe-core reports no serious or critical issues in the booking flow on desktop and phone.

## Assets and licences

| Asset                   | Source                                              | Licence                   |
| ----------------------- | --------------------------------------------------- | ------------------------- |
| Manrope, JetBrains Mono | `@fontsource/manrope`, `@fontsource/jetbrains-mono` | SIL Open Font License 1.1 |
| Logo, icons             | Inline SVG in this repository                       | Part of this project      |
