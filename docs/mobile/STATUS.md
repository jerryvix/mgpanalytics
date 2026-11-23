# Status

**Updated:** 2026-11-23 · **Phase:** Week 1 (setup) · **Target submit:** ~2026-12-16 · **On track:** yes, pending Apple enrollment

## Blocked on owner

- **Deploy `sync-betting-splits`.** Splits (the core data, D-053) have been frozen since Nov 2 because DraftKings redesigned its page. The parser fix is pushed on this branch and tested; it needs a deploy (owner runs it, or gives Claude a Supabase access token through the secure form).

- Apple enrollment (D-U-N-S + organization). Critical path; gates the first TestFlight build. See `OWNER_ACTIONS.md` items 1 to 3.
- Review board notes answered (8 Insiders, 12 alerts + game bell, 23 bankroll v1.1, 25 guest browsing). Note 4 decided after a simulated survey of 1,000: headline "Bet Smarter, Not Harder.", your teams first on Home (D-026, `research/`).

## Done

- Plan, decisions, compliance checklist, reference teardown (`docs/mobile/`).
- Current web app captured at iPhone size (`docs/mobile/design/current/`).
- Design tokens for the app, light and dark, contrast-checked (`packages/shared/design-tokens/`).
- Review board published: page 1 current app + design system + findings, page 2 Stocks.News comparison with 23 numbered notes.
- App Store name "MGP Analytics" checked available.
- Owner's Stocks.News screen recording analyzed: guest browsing, module Home, soft notification asks, detail layout. Board updated (notes 24 to 33); decisions D-014 to D-018. Owner confirmed guest browsing and the guest, free, Pro ladder (D-019), one-tap sign-up (D-020), Insiders from X (D-021).
- Expo app scaffolded in `mobile/`: five native tabs (Today, Games, Alerts, Insiders, Analyst), theme wired to shared tokens, iPhone only, bundle ID set. Typecheck, lint and iOS bundle pass.

- 2026-11-21 owner direction applied: headline "Bet Smarter, Not Harder"; Title Case labels (app + website visible labels, shared `titleCase()` with tests); sports-first personalization; alerts on from the start; "The Analyst"; Pro direction; Manrope in the app (5 weights); black rank badges (app tokens + website). Website: 1,040 tests pass, build passes, lint unchanged. App: typecheck, lint, iOS bundle pass. Decisions D-027 to D-033.

## In progress

- Supabase client and sign-in in the app.

## Next

1. Deploy the splits parser fix (football splits frozen since Nov 2), then confirm fresh rows in `betting_splits`.
2. NBA and college basketball splits: built and tested (D-056), go live with the same deploy. College basketball covers only the ranked games `ncaab_games` stores until `sync-ncaab-games` keeps every Division I game. MLB when DraftKings lists it in spring.
3. Splits-first mockups done with real data (canvas page "Splits First · Pulse"): Today rows with bets and money, a Pulse tab (Bets & Money, Trends, Results) replacing Insiders, and a game page that opens on Bets & Money then Trends. Proposal pending owner review (D-055, `proposals/2026-11-23-pulse.md`). Leaders view (ATS and over/under tables) added after the owner's college football example (D-057); needs a one-time CollegeFootballData backfill of Weeks 0 to 3.
4. Backend for trends: ATS and over/under from results plus closing lines (football and MLB first), `odds_history` ID fix for basketball, injuries for NFL, college football and MLB, The Analyst game_id support.
5. Build the game page in the app by Nov 27/28.

## Open decisions (owner, later)

- Website: move the remaining amber (ranked game card outlines, "View All Odds" buttons) to neutral too? (D-033)

- X API spend for in-app insider posts: on hold by owner (D-023).
- Game-first proposal aligned (D-035 to D-038). Mockups for owner review: https://claude.ai/artifact/7ZWWFemMUESwBoLiFsEk3i (game page top, sections, dark; welcome; what do you bet on; Today with first-launch arrow). Mockups revised Nov 21 with team logos, sportsbook-standard odds and no trailing periods (D-039 to D-041). Nov 21 (later): owner found the look generic; three directions (A Scoreboard, B Terminal, C Editorial) and three matching landing heroes added to the canvas; ranks now plain "#12" text in mockups and on the website (D-042 to D-044). Landing decided (C Game Tickets; B for ads). Round 2 directions D, E, F on the canvas (D-045, D-046). Direction G, Night Game, built from the owner's Sleeper and ESPN references, with live header-font and accent tweaks (D-047). Nov 23: owner liked G's clarity but found it too close to Sleeper; Direction H, MGP's own look (serif headers, game tickets, neutral night and day modes, pulsing MGP green), added to the canvas (D-048). Nov 23 (later): owner sent an events app and Instagram as references and moved the editorial serif to ads; Direction I, Night List (true black, one sans, list rows, beating pulse for moved lines), added to the canvas (D-049). Owner picked I (D-050): tokens now carry I (true black and white, MGP green, Geist in the app, serif for marketing only); app typecheck, lint and iOS bundle pass. Stories mocked on the canvas (D-051), then parked for v1 (D-052): circles open the game page, the game page gets a plain Share button with tap counts, and the owner tests line-move posts on social first. Next: build the full game page by Nov 27/28.
- Odds sources: football and MLB are DraftKings only; faster alerts or more books need a paid feed (D-034).

- Faster odds polling plan for real-time line-move alerts (cost quote coming).
- Data licensing review before any paywall (see `APP_STORE_COMPLIANCE.md`).
