# Decision Log

Newest at the bottom. Each entry: what was decided, why, and who decided. "Owner" means Jerry. "Builder" means whoever is building (currently Claude). To reverse a decision, add a new entry that supersedes it; don't edit the old one.

---

### D-001 Apple Developer account is owned by the company (LLC), not an individual
**Date:** 2026-11-20 · **By:** Owner
**Why:** Apple expects apps in regulated areas (betting-related content) to come from a legal entity, and the seller name on the store listing should be the company, not a personal name. Requires a D-U-N-S number for the LLC.
**Consequence:** enrollment takes about 1 to 2 weeks instead of 1 to 2 days; it is the critical path.

### D-002 Free at launch, paywall built but switched off
**Date:** 2026-11-20 · **By:** Owner
**Why:** fastest approval, builds an audience first. Subscriptions add in-app purchase setup, banking and tax forms, and need a data-licensing check before charging (see `APP_STORE_COMPLIANCE.md`).
**Consequence:** screens read entitlements through one hook so v1.1 can turn on a subscription without restructuring.

### D-003 Native rebuild with Expo (React Native), not a wrapped website
**Date:** 2026-11-20 · **By:** Owner (on builder recommendation)
**Why:** Apple often rejects website wrappers (guideline 4.2). The screens are being redesigned anyway, so building them natively costs little extra. Expo builds in the cloud (no Mac), gives Android nearly free, and supports over-the-air fixes.
**Alternatives rejected:** Capacitor wrapper of the existing site (faster to package, but rejection risk and it would not feel native).

### D-004 Claude designs; the owner's advisor reviews in Figma
**Date:** 2026-11-20 · **By:** Owner
**Why:** keeps design moving without waiting on another person. Figma is the review surface; design tokens in code are the source of truth.

### D-005 Compressed timeline: submit around Dec 16, 2026
**Date:** 2026-11-20 · **By:** Builder (owner asked for faster than 12 weeks)
**Why:** the original 12-week estimate assumed a human team with a gated design phase and long beta. Design now runs alongside the build, and v1 scope is limited to first-week essentials (see `PLAN.md`).

### D-006 Web app stays at the repo root, untouched; mobile lives in `mobile/`
**Date:** 2026-11-20 · **By:** Builder
**Why:** moving the web app into a monorepo folder would require changing the Vercel project's root directory, which is a production deploy risk for no user benefit. Pure logic shared by both clients goes in `packages/shared/`.

### D-007 No mock or random data in the app
**Date:** 2026-11-20 · **By:** Builder
**Why:** `PublicBettingPreview` and parts of the NFL advanced stats use `Math.random()` (see `docs/positioning.md`). Shipping made-up numbers in a store app breaks MGP's "we don't make things up" positioning and risks guideline 2.3 (accurate metadata). Those surfaces are not ported until they have real data.

### D-008 No sportsbook links in v1
**Date:** 2026-11-20 · **By:** Builder
**Why:** some synced content contains DraftKings deep links with referral parameters. Linking out to real-money sportsbooks invites extra App Review scrutiny and state-by-state legality questions. Revisit if affiliate revenue becomes a goal.

### D-009 No league or team logos in the app icon, store screenshots or listing
**Date:** 2026-11-20 · **By:** Builder
**Why:** team logos are league trademarks and are currently loaded from ESPN's CDN (78 references in `src/`). In-app use is a known risk to review before charging money; store marketing must not use them at all (guideline 5.2).

### D-010 Practice bankroll ("simulator") deferred to v1.1
**Date:** 2026-11-20 · **By:** Builder
**Why:** it's the Stocks.News "practice with $100K" pattern and a good retention feature, but it is new scope and counts as simulated gambling for the age rating. Ship v1 first.

### D-011 Bundle identifier `com.mgpanalytics.app`
**Date:** 2026-11-20 · **By:** Builder
**Why:** bundle IDs are permanent once an app is created in App Store Connect. Matches the company domain family. App Store name "MGP Analytics" checked available on 2026-11-20.

### D-012 Push permission is requested at the end of onboarding, not on first launch
**Date:** 2026-11-20 · **By:** Builder
**Why:** iOS shows the system permission prompt once. Asking after the user has picked teams and alert types (so they know what they'll get) gets far higher opt-in. Alerts are the core feature, so this matters.
