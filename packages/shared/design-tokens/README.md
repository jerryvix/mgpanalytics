# Design tokens

`tokens.json` is the source of truth for MGP's visual system, in the W3C Design Tokens (DTCG) format, which Figma variable importers read.

- `app`: the iPhone app system (light and dark). Every text color passes WCAG AA (4.5:1) on its surface; `textTertiary` is for captions and timestamps, never for actionable text.
- `web-current`: the web app as of 2026-11-20, kept as a record. The web app is dark only, with a terminal style (IBM Plex Mono and uppercase labels throughout).

## Direction (app vs web)

| | Web today | App v1 |
|---|---|---|
| Theme | Dark only | Follows the phone's light or dark setting |
| Body font | Space Grotesk + IBM Plex Mono everywhere | System font (SF Pro) for UI; Space Grotesk for titles and big numbers |
| Labels | UPPERCASE MONO | Sentence case |
| Corners | 4px | 10px chips, 12px rows, 16px cards |
| Brand green | #22C373 | Same green on dark; deeper #0E874D on light for contrast |
| Numbers | Mono | Tabular figures so odds and scores line up |

## Changing a token

Edit `tokens.json`, keep the contrast rule above, and note any visible change in `docs/mobile/DECISIONS.md`.
