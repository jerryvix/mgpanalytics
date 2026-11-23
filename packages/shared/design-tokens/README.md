# Design tokens

`tokens.json` is the source of truth for MGP's visual system, in the W3C Design Tokens (DTCG) format, which Figma variable importers read.

- `app`: the iPhone app system, Direction I, Night List (owner pick Nov 23; DECISIONS D-049, D-050). Night is true black, day is white. Every text color passes WCAG AA (4.5:1) on `bg`, `surface` and `surfaceRaised`; `textTertiary` is for captions and timestamps, never for actionable text.
- `web-current`: the web app as of 2026-11-20, kept as a record. The web app is dark only, with a terminal style (IBM Plex Mono and uppercase labels throughout).

## Direction (app vs web)

| | Web today | App v1 |
|---|---|---|
| Theme | Dark only | Follows the phone's setting: true black night, white day |
| Font | Space Grotesk + IBM Plex Mono everywhere | Geist everywhere (Direction I): 400 body, 500 titles and numbers, 600 labels. Size and gray set the hierarchy, not bold. Instrument Serif only in marketing (ads, store screenshots, website hero, share cards) |
| Labels | UPPERCASE MONO | Title Case for anything that isn't a sentence (owner rule, Nov 21); sentences stay sentence case |
| Layout | Cards | No cards: rows sit on the background with hairlines; a selected chip is a soft pill, the rest plain gray text |
| Brand green | #22C373 | #2FE38A on night, #0E884E (fills) and #0B7A44 (text) on day. Only for movement, unseen items and things you can tap |
| Numbers | Mono | Tabular figures so odds and scores line up |
| Ranks | Amber badges | Plain "#12" text in the secondary color (D-042) |
| Amber | Accent color across the site | Not used, except warning text |

## Changing a token

Edit `tokens.json`, keep the contrast rule above, and note any visible change in `docs/mobile/DECISIONS.md`.
