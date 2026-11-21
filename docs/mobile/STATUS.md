# Status

**Updated:** 2026-11-20 · **Phase:** Week 1 (setup) · **Target submit:** ~2026-12-16 · **On track:** yes, pending Apple enrollment

## Blocked on owner

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

- Figma import of the review board for the advisor (owner runs one plugin step; instructions in chat).
- Backend prerequisites: account deletion function, push token and alert tables.
- Core screens: onboarding, Today, Games, game detail, Profile.

## Open decisions (owner, later)

- Website: move the remaining amber (ranked game card outlines, "View All Odds" buttons) to neutral too? (D-033)

- X API spend for in-app insider posts: on hold by owner (D-023).
- Game-first proposal (`proposals/2026-11-21-game-first.md`): awaiting owner alignment, then mockups.
- Odds sources: football and MLB are DraftKings only; faster alerts or more books need a paid feed (D-034).

- Faster odds polling plan for real-time line-move alerts (cost quote coming).
- Data licensing review before any paywall (see `APP_STORE_COMPLIANCE.md`).
