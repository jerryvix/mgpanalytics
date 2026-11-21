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

### D-013 App visual direction (proposed, pending owner review)
**Date:** 2026-11-20 · **By:** Builder
**What:** keep MGP green; ~~system font (SF Pro) for UI with Space Grotesk for titles~~ Manrope (D-032); ~~sentence case~~ Title Case labels (D-027) instead of uppercase mono; 10/12/16px corners; light and dark themes following the phone setting. Tokens in `packages/shared/design-tokens/tokens.json`.
**Why:** the web app's terminal style (IBM Plex Mono, uppercase, 4px corners, dark only) reads as a pro tool; the goal is "clean and easy for new users". Review board: https://claude.ai/artifact/94MNqZHA2ELsZdyq87HKJ7 (private; owner shares it with reviewers).

### D-014 Guest browsing: no login wall (approved by owner 2026-11-20)
**Date:** 2026-11-20 · **By:** Builder
**What:** the app opens on Today with no account. An account is requested only to follow something, set an alert, or use the Analyst, through a bottom sheet over the content (the Stocks.News pattern).
**Why:** the owner's recording shows Stocks.News never asks a browsing user to sign in. Apple's guideline 5.1.1(v) asks apps whose core features aren't account-based to let people use them without logging in. A login wall is where most new users drop off.
**How:** Supabase anonymous sign-in gives each guest a user id, so follows and alert settings save from the first tap; signing up links the guest to a real account and keeps them. The Analyst requires a real account (LLM cost and per-user rate limits). Needs anonymous sign-ins enabled in the Supabase dashboard, with CAPTCHA, and an RLS review so anonymous users can't read other users' data.
**Supersedes:** the welcome-then-sign-up flow in the original PLAN v1 scope rows 1 to 3.

### D-015 Home is a feed of modules under a sport bar
**Date:** 2026-11-20 · **By:** Builder
**What:** a scrolling sport bar (All, NFL, NBA, NCAAB, NCAAF, MLB) above short modules that each end in "More": biggest line moves, your teams today, tonight's games, hot streaks (in season), insiders, games this week. Sports out of season show a short offseason module, never an empty screen.
**Why:** the recording shows this is how Stocks.News Home works (category bar plus modules); it scales to five sports without nested tabs. Replaces "one ranked list" from the store screenshots.

### D-016 No verdict gauges or ratings
**Date:** 2026-11-20 · **By:** Builder
**Why:** Stocks.News shows "Strong sell / Strong buy" gauges. For MGP that would be picks language, which the product and the Analyst forbid (`docs/positioning.md`). Show data, never a verdict.

### D-017 No paid placements in the feed
**Date:** 2026-11-20 · **By:** Builder
**Why:** Stocks.News places sponsored press releases at the top of Home, and its reviews accuse it of pump-and-dump. MGP's position is "we don't make things up"; paid placement that looks editorial undermines it.

### D-018 Notification permission via soft asks (amends D-012)
**Date:** 2026-11-20 · **By:** Builder
**What:** onboarding ends with an optional "Get alerts for your teams" screen. After that, a slim "Turn on alerts" bar above the tab bar and "Alert me" buttons on modules. The iPhone system prompt appears only after the user taps one of these.
**Why:** the system prompt can be shown once; Stocks.News keeps a persistent soft prompt plus per-module buttons, which keeps the system prompt for people who already said yes.

### D-019 Access ladder: guest, then free account, then Pro
**Date:** 2026-11-20 · **By:** Owner direction, builder design
**What:** three levels. Guests browse everything public (Today, Games, game detail, Insiders list). A free account unlocks following, alerts and the Analyst. Pro (v1.1, off at launch per D-002) unlocks deeper features to be chosen later. Every locked feature uses the same bottom sheet over visible content, so people see what they'd get.
**Why:** the owner's read of Stocks.News: "slowly getting people there". Each step asks for a little more after showing value.

### D-020 Sign-up is one tap
**Date:** 2026-11-20 · **By:** Owner direction, builder design
**What:** the sign-up sheet leads with Sign in with Apple (Face ID, no typing), then Google, then email with a 6-digit code (no password to invent). Existing web users can still sign in with their password. No profile questions at sign-up; sports and teams were already picked as a guest and carry over.
**Why:** the owner asked for sign-up to be as easy as possible. Every extra field loses people.

### D-021 Insiders shows what popular X accounts are saying, pulled server-side (ON HOLD, see D-023)
**Date:** 2026-11-20 · **By:** Owner direction, builder design
**What:** a sync job pulls new posts from a curated list of insider accounts through the X API, stores them, and the app shows them natively in the Insiders tab and on game pages, with name, handle, time and a link to the original post on X.
**Why:** the website uses X's embed widget plus one hard-coded sample post (`src/components/twitter/LatestFromX.tsx`). Embeds are slow and unreliable on a phone and can't be filtered or ranked. A native feed needs the API.
**Cost:** X sells API access pay-per-use, reported at about $0.005 per post read (third-party sources, Nov 2026; confirm on console.x.com). Fetching only new posts, 50 accounts posting about 10 times a day is roughly 15,000 reads, about $75 a month. Owner approves before it's switched on. Without it, Insiders launches with profiles, follow and "Open on X" links.

### D-022 Keep recurring costs as low as possible
**Date:** 2026-11-20 · **By:** Owner
**What:** no new paid service or plan upgrade without the owner's approval. Prefer data MGP already syncs and free tiers. When a feature needs paid data, ship the free version first and bring the cost as a separate decision.

### D-023 X API on hold; Insiders launches without in-app posts
**Date:** 2026-11-20 · **By:** Owner (cost, D-022)
**What:** v1 Insiders shows profiles, categories (Sharps, Insiders, Analysts, Media, Props), follow, and "Open on X" for each account. No X API spend. Showing posts inside the app (D-021) waits until the owner approves the cost.

### D-024 Launch alerts, plus a bell to follow any single game
**Date:** 2026-11-20 · **By:** Owner
**What:** v1 push alerts: your team's game is starting, final scores for your teams, and big line moves on your teams' games. A bell on every game page follows just that game: you get the same alerts for it whether or not you follow either team. Low build cost (one more subscription type).
**Line moves without new cost:** alerts use the odds refresh MGP already runs (about every 6 hours), and their copy says so plainly ("moved 2 points since this morning"), never "live". Before launch, check The Odds API quota MGP already pays for. If there's headroom, refresh more often on game days at no extra cost. Any plan upgrade goes to the owner (D-022).

### D-025 Owner answers on the review board (notes 8 and 23)
**Date:** 2026-11-20 · **By:** Owner
**What:** the fourth tab is named **Insiders**. The practice bankroll is confirmed for **v1.1** (D-010).
**Note 4 (what leads Home):** the owner reframed it around the pitch: beat the books, the upper hand pros have, a level playing field. A simulated survey of 1,000 bettors and industry people is testing these headlines and the first Home module. Results go in `docs/mobile/research/`.

### D-026 Headline, Home order and copy rules from the simulated survey
**Date:** 2026-11-20 · **By:** Owner (headline), builder (the rest) · **Source:** `research/2026-11-20-simulated-survey.md`
**Headline:** "Bet Smarter, Not Harder" (no period, owner 2026-11-21) leads the App Store listing and the welcome screen. Supporting line: "Every number you need. One app."
**Not used in store or app copy:** "Beat the sportsbooks", "Bet like a pro", "The upper hand the pros have", "Level the playing field" (tested last or flagged as tout language), and "See where the money's moving" (MGP has no money-flow data; positioning DO NOT CLAIM). "Get an edge on the books" stays on the website if the owner keeps it, but not in the App Store listing (heavily flagged as a compliance risk).
**Home order:** superseded by D-028 (personalize by sports, not teams). Line-move module title: "See where the lines are moving." Streaks sit lower, always with sample size ("12 of last 15").
**Copy rules:** introduce the Analyst by what it does ("Ask anything about tonight's games"), not by what it won't do. The Insiders tab carries a one-line description ("Well-known betting voices, in one place"). Every odds number shows an "as of" time. Push alerts are opt-in per type with a daily cap.
**Pro tier input (v1.1):** props tools and faster line-move alerts were the most-wanted paid features; faster alerts can fund their own faster odds refresh (D-022).

### D-027 Labels are Title Case; sentences stay sentence case
**Date:** 2026-11-21 · **By:** Owner
**Rule:** any words on screen that aren't in a sentence (titles, headings, buttons, tabs, chips, badges, menu items, section names) are Title Case: every word capitalized except articles, short conjunctions and short prepositions in the middle ("Player Props", "Browse by Sport", "Lakers vs Celtics"). Sentences (descriptions, empty states, alerts, tooltips, screen-reader labels) stay sentence case. Acronyms stay as written (NBA, O/U).
**Applied:** the iPhone app from day one; the website's visible labels on 2026-11-21 (chat suggestion chips, badges, buttons, headings, walkthrough titles). Labels built from data go through `titleCase()` in `packages/shared/text/title-case.ts` (tested in `src/test/titleCase.test.ts`).

### D-028 Personalize by the sports people bet on, not their teams
**Date:** 2026-11-21 · **By:** Owner direction, builder design (supersedes D-026 Home order)
**Why:** bettors bet across a whole sport, not only on their favorite teams.
**What:** onboarding asks "What do you bet on?" (pick sports) first; favorite teams are optional. The sport bar lists your sports first. Home opens on **Today in Your Sports** (today's games in your sports, each with the current line and the move since open, favorite teams pinned on top), then **See Where the Lines Are Moving** (biggest moves in your sports). Guests who skip see all sports.

### D-029 Push notifications on from the start (amends D-012 and D-018)
**Date:** 2026-11-21 · **By:** Owner direction, builder design
**Why:** people forget apps; alerts bring them back.
**What:** iOS can't switch alerts on without the user's yes, so: (1) from first launch the app requests *provisional* permission, which delivers quiet alerts to Notification Center with no pop-up; (2) right after picking sports, onboarding shows what alerts look like and asks for full permission; (3) every alert type starts ON for your sports, teams and followed games; (4) a daily cap keeps it from becoming spam (51% in the survey delete apps for spam); (5) the soft "Turn On Alerts" bar stays for anyone who said no. Alerts are about games, not marketing; any promotional push would need separate opt-in (App Review 4.5.4).

### D-030 The Analyst
**Date:** 2026-11-21 · **By:** Owner
**What:** the AI chat is named **The Analyst**: the tab label, the screen title, and in copy ("Ask The Analyst").

### D-031 Pro tier direction: props tools and faster alerts
**Date:** 2026-11-21 · **By:** Owner
**What:** when Pro turns on (v1.1, D-002), it centers on props tools and faster line-move alerts. Pro revenue pays for the faster odds refresh those alerts need (D-022).

### D-032 Font: Manrope
**Date:** 2026-11-21 · **By:** Owner (chosen from six options: https://claude.ai/artifact/Kinxhem61SWWVRzHKvRbsx)
**What:** Manrope for everything in the app: 400 body, 500 small text, 600 labels and tabs, 700 to 800 titles and big numbers; tabular figures for odds and scores. Only these five weights ship (about 490 KB). Free (open font license). Supersedes the font part of D-013.

### D-033 Rank badges are black, not amber
**Date:** 2026-11-21 · **By:** Owner ("amber feels amateurish"; saturation and brightness matter more than hue)
**What:** rank badges are black with white numbers in light mode and charcoal (#3A414D) with near-white numbers in dark mode. Tokens `rank` and `onRank`. Amber is removed from the app palette except warning text. Website: college team ranks, "Ranked" chips, the ranked-games count and the player top-rank circles now use the same charcoal (`--rank`). Amber still appears elsewhere on the website (ranked game card outlines, "View All Odds" buttons); owner to decide whether those follow.

### D-034 Corrections from the Nov 21 data audit
**Date:** 2026-11-21 · **By:** Builder
- **D-024 correction:** there is no Odds API quota to check. The Odds API key stopped working in July 2026, and game odds moved to ESPN's free DraftKings feed (owner decision Aug 7, 2026; `supabase/functions/_shared/espn-odds.ts`). Faster line-move alerts would need a new odds source, which is a cost decision (D-022).
- **D-026 correction:** MGP does have money data for NFL and college football: DraftKings % of bets and % of money (`betting_splits`), refreshed about every 4 hours. Other sports have none. The Home module title stays "See Where the Lines Are Moving" so it reads the same in every sport.
- **Books:** NFL, college football and MLB odds are DraftKings only; NBA and college basketball have 4 books. App copy names the book next to every price and never claims "4 books" across sports.
- **Proposal:** the game-first plan, Start Here, and the full audit are in `proposals/2026-11-21-game-first.md`.

### D-035 Keep the lean, renamed "Signal" (amends D-016)
**Date:** 2026-11-21 · **By:** Owner
**What:** the college football "Signal Lean" tile stays, renamed **Signal**. It's an aggregate of the data shown beneath it and isn't responsible for being right. The app's game page gets a Signal section wherever MGP has signals (college football today: roster continuity, head-to-head, draft talent).
**Guardrails (builder):** the factors behind a Signal are always visible right under it; one short line says it's built from the data below; it never appears in push alerts, App Store copy or ads; it's named "Signal" rather than "The Analyst's Signal" so The Analyst chat keeps its "won't tell you what to bet" promise (owner can rename). Website tile renamed 2026-11-21.
**Risk noted to owner:** in the simulated concept test, a side-picking score lowered trust overall and drew the most compliance flags; a lawyer's read before launch is recommended.

### D-036 Almost no footnotes; one "About This Data" page (amends D-026)
**Date:** 2026-11-21 · **By:** Owner
**What:** no per-number notes. Each odds section carries one small line naming the book and when it was updated ("DraftKings · Updated 2:10 PM"). Everything else (sources, refresh times, which sports have which books, disclaimers, 1-800-GAMBLER) lives on an **About This Data** page, linked once at the bottom of every game page and from Profile.
**Odds sources:** launch with what MGP has ($0): DraftKings for NFL, college football and MLB; 4 books for NBA and college basketball. No props at launch (feed is down).

### D-037 Guide with arrows, not a "Start Here" box
**Date:** 2026-11-21 · **By:** Owner direction, builder design
**What:** the owner has seen apps point you to where to start with arrows, not a labeled section. First launch: coach marks with arrows walk a new user through tapping a game and what to look at. Game page: the top facts are rows with an arrow that jumps to the section behind each fact, and that section's key number is highlighted when you land. Final label and look decided in the mockups.

### D-038 Everything with data, by end of week
**Date:** 2026-11-21 · **By:** Owner ("why can't we have everything by end of week?")
**What:** the game page ships with every section MGP has data for, not a trimmed v1, with a build target of Nov 27/28, 2026.
**Limits that aren't build time:** backend fixes (injuries for NFL, college football and MLB; college basketball finals; line-movement IDs; against-the-spread; The Analyst per game) need Supabase access; TestFlight needs the Apple account; props need a paid feed (owner chose $0); in-app X posts are on hold (D-023).

### D-039 Betting data uses sportsbook-standard notation
**Date:** 2026-11-21 · **By:** Owner ("make sure all betting data the way we present it is industry standard")
**What:** spreads read "Oregon −6.5" (team first, sign always shown, "PK" for pick'em); prices in parentheses "−6.5 (−110)"; totals "O 52.5" / "U 52.5" or "O/U 52.5"; moneylines "−245" / "+200"; movement "Opened Oregon −4.5" or "−4.5 → −6.5"; records "5-5" with pushes "5-4-1"; against the spread "5-5 ATS". Odds boards use sportsbook columns: Spread, Total, Moneyline, one row per team with its logo. No invented units like "2.0 Pts".
**How:** all new UI formats odds through `packages/shared/odds/format.ts` (tested in `src/test/oddsFormat.test.ts`). The website still formats odds inline in about 8 components; they move to the shared helpers during the website relayer.

### D-040 No period at the end of UI text
**Date:** 2026-11-21 · **By:** Owner
**What:** facts, captions, subtitles, list items and callouts don't end with a period ("Oregon has won 4 straight"). Copy with more than one sentence keeps the periods between sentences and drops the last one ("Pick a game. We'll show you what matters all in one place").

### D-041 Team logos and the MGP mark throughout the app
**Date:** 2026-11-21 · **By:** Owner ("we need it to feel like a premium app")
**What:** team logos on every game row, odds board, injury and form row; league logos on sport chips and sport pickers; the MGP mark (green pulse line on a black rounded square, from `public/favicon.svg`) on Welcome and Today. Logos come from the same ESPN source the website uses. Store screenshots and the app icon still carry no league or team logos (D-009).
