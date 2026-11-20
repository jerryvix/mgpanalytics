# Status

**Updated:** 2026-11-20 · **Phase:** Week 1 (setup) · **Target submit:** ~2026-12-16 · **On track:** yes, pending Apple enrollment

## Blocked on owner

- Apple enrollment (D-U-N-S + organization). Critical path; gates the first TestFlight build. See `OWNER_ACTIONS.md` items 1 to 3.
- Design review: answer the blue "Your call" notes 4, 8, 12 and 23 (note 25 decided: guest browsing) on page 2 of the review board (https://claude.ai/artifact/94MNqZHA2ELsZdyq87HKJ7). Not blocking the build; defaults are the recommended options.

## Done

- Plan, decisions, compliance checklist, reference teardown (`docs/mobile/`).
- Current web app captured at iPhone size (`docs/mobile/design/current/`).
- Design tokens for the app, light and dark, contrast-checked (`packages/shared/design-tokens/`).
- Review board published: page 1 current app + design system + findings, page 2 Stocks.News comparison with 23 numbered notes.
- App Store name "MGP Analytics" checked available.
- Owner's Stocks.News screen recording analyzed: guest browsing, module Home, soft notification asks, detail layout. Board updated (notes 24 to 33); decisions D-014 to D-018. Owner confirmed guest browsing and the guest, free, Pro ladder (D-019), one-tap sign-up (D-020), Insiders from X (D-021).
- Expo app scaffolded in `mobile/`: five native tabs (Today, Games, Alerts, Insiders, Analyst), theme wired to shared tokens, iPhone only, bundle ID set. Typecheck, lint and iOS bundle pass.

## In progress

- Supabase client and sign-in in the app.

## Next

- Figma import of the review board for the advisor (owner runs one plugin step; instructions in chat).
- Backend prerequisites: account deletion function, push token and alert tables.
- Core screens: onboarding, Today, Games, game detail, Profile.

## Open decisions (owner, later)

- X API spend for the Insiders feed (about $75/month estimate, D-021).

- Faster odds polling plan for real-time line-move alerts (cost quote coming).
- Data licensing review before any paywall (see `APP_STORE_COMPLIANCE.md`).
