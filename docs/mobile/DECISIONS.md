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

### D-042 Ranks are plain "#12" text, no bubble (supersedes the badge shape in D-033)
**Date:** 2026-11-21 · **By:** Owner ("the bubble feels generic")
**What:** a rank reads "#12 Oregon": the number in the secondary text color, same size as the name or slightly smaller, no background shape. Applied to the mockups and the website (college football and basketball slates; NBA and MLB player cards now show "#2" before the name instead of a corner circle). The charcoal `rank` color stays only for the "Ranked" label and the ranked-games count.

### D-043 Why the first mockups felt generic, and the motion standard
**Date:** 2026-11-21 · **By:** Builder, from owner feedback ("feels very basic Claude", "too consistent", wants "sleek")
**Diagnosis:** every section was a white rounded card on gray with the same radius, padding and pill chips; nearly every label was bold so nothing stood out; icons sat in pale tinted circles. That uniform "card soup" is the default look of template and AI-made apps.
**Direction:** fewer boxes (hairlines and spacing instead of cards), real typographic contrast (big numbers, small quiet labels), team colors where they mean something, thin-stroke icons, underline tabs instead of pills. Three directions are on the mockup canvas (Directions page): A Scoreboard, B Terminal, C Editorial. Owner picks.
**Motion standard (to build regardless of direction):** every tap gets a slight press and a light haptic; tapping a game row morphs its logos and line into the game page header; large titles collapse into the nav bar as you scroll and the section bar's underline slides with the scroll position; tapping a What to Know arrow springs to its section and briefly highlights it; odds digits roll to new values instead of jumping; loading uses placeholders shaped like the content, no spinners; pull to refresh draws the MGP pulse line; all animation runs on the UI thread (Reanimated) at the screen's full refresh rate and respects Reduce Motion.
**Kept:** the first-launch arrow callout (owner likes it).

### D-044 Landing concepts (decided 2026-11-21, see D-045)
**Date:** 2026-11-21 · **By:** Owner request ("a better, less generic landing page" like Stocks.News's hero)
**What:** three heroes on the mockup canvas (Landing page), one per direction: A Game Plates (team-color matchup plates, condensed type), B The Line (one big line-movement chart, terminal type), C Game Tickets (fanned game tickets, serif type). Each is sized as the first App Store screenshot and becomes the website hero and the app's Welcome screen. No team logos in store art (D-009); team names and colors instead.

### D-045 Landing: Game Tickets; The Line saved for ads
**Date:** 2026-11-21 · **By:** Owner
**What:** concept C, Game Tickets (fanned game tickets, "Bet Smarter, Not Harder"), becomes the first App Store screenshot, the website's top section and the app's Welcome screen. Concept B, The Line (big line-movement chart), is kept for ads and social posts. Its type and colors follow whichever app direction wins (D-046).

### D-046 Visual direction: second round (pending owner pick)
**Date:** 2026-11-21 · **By:** Owner feedback, builder design
**Round 1 ranking (owner):** C Editorial, then B Terminal, then A Scoreboard. A's large team-color blocks are out; the scoreboard idea is liked.
**Round 2 (canvas page "More Directions"):** D Timing Tower (motorsport live timing: thin rows, italic numbers, the line's week as timing sectors, violet accent); E Trading Card (the back of a classic baseball card: one card per game, swipe between games, flip for more; pairs with the Game Tickets landing); F Ballpark Board (hand-hung stadium scoreboard: numbers on black tiles, black and white, one green accent on changed numbers). Owner asked not to borrow from stock boards, newspapers, airport boards, ESPN or streaming apps. Team color appears only as thin accents.

### D-047 Direction G, Night Game (built from owner's Sleeper and ESPN references; pending pick)
**Date:** 2026-11-21 · **By:** Owner references, builder design
**What the references share:** two fonts with separate jobs, a bold display font for headers (screen titles, date headers, section names) and a quiet regular-weight font for data, so the headers act as landmarks and you don't get lost in numbers (owner's observation); navy or near-black base with content grouped into panels; white for what matters, gray for records, times and networks; one bright accent used for meaning (category labels, things you can tap); rank as a small gray number before the name; odds in one familiar line ("Spread: ORE −6.5 · Total: 52.5 · ML: MSU +200"); pill filters; a floating capsule tab bar.
**Mockups:** canvas page "G · Night Game" (Today and Game Page). Data font Instrument Sans; header font and accent are live Tweaks: Bricolage Grotesque, Instrument Serif, Outfit or Anybody; teal, MGP green, electric blue or violet.

### D-048 Direction H, MGP's own look (pending owner pick)
**Date:** 2026-11-23 · **By:** Owner feedback on G, builder design
**Owner feedback on G:** cleaner and easier to follow, a good start, but too close to Sleeper; teal is Sleeper's color. MGP should take elements from others and be its own thing, not Sleeper and not Kalshi. Keep the market-style green from the original MGP as a "pulsating" signature green; bring back the editorial and game-ticket feel; use a night mode and day mode instead of navy; the look has to work if MGP grows beyond sports.
**What H is:** G's structure (Today list, game page, pill filters, floating tab bar) with: Instrument Serif headers and Instrument Sans data (the Editorial and Game Tickets fonts); every game drawn as a ticket, with a perforated stub that holds the line ("ORE −6.5", "Open −4.5"); a neutral graphite night base (#0C0D0E, panels #151618, no blue tint) and a matching light day mode (#F1F2F3, white tickets); one MGP green used only for what moved, what is live and what you can tap. A small green dot pulses next to any line that has moved since open; lines that haven't moved show a gray dot. The pulse respects Reduce Motion.
**Brand optionality:** tickets, serif headlines and a market green are not sports-specific, so the same system can carry other markets later.
**Greens to choose from (Tweaks):** night #2FE38A (brighter "pulse" green, default), #22C373 (the original MGP green), #00D97E; day #0E8A4F, #0B7A44, #128C5A (darker so it reads on white).
**Mockups:** canvas page "H · MGP" (Today Night, Game Page Night, Today Day).

### D-049 Direction I, Night List; the serif moves to ads (pending owner pick)
**Date:** 2026-11-23 · **By:** Owner references (an events app's "This week" list and Instagram's dark message list), builder design
**Owner direction:** on second thought, the editorial serif is for ads (a ticket-style ad and similar), not the app.
**What the references share:** true black background with no cards; one plain sans font where size and gray, not bold, set the hierarchy (large regular-weight title, gray subtitle, regular-weight date headers); simple rows with an image on the left, two lines of text and one action on the right; a selected chip shown as a soft dark pill, the rest as plain gray text; a small colored status with a pulse icon ("Selling fast"); bold rows and colored rings for what is new since you last looked.
**What I is:** that structure in MGP terms. Today: "Biggest Moves" row of team circles with the move in a bubble above ("−4.5 → −6.5"), green ring if you haven't seen it; rows by sport with both team logos overlapped like a group-chat photo, matchup, time and network, and the line on the right. Games: a day picker and date headers, with a bell on every game (filled green when alerts are on), which delivers the per-game alert option. Game page: round back, bell and share buttons, big team names, odds table on hairlines, chips for sections, What to Know arrows, Signal. MGP green only for movement and things you can tap; the pulse line from the MGP logo beats next to any line that moved (honors Reduce Motion).
**Type:** one sans family in the app. Tweaks compare Geist, Instrument Sans and the iPhone's SF Pro. Instrument Serif and the ticket shapes stay for marketing: ads, store screenshots and the website hero (D-045). The app's Welcome screen can still show the ticket hero art with sans text.
**Mockups:** canvas page "I · Night List" (Today Night, Games, Game Page, Today Day).

### D-050 Direction I chosen; tokens locked (supersedes the Manrope pick in D-032)
**Date:** 2026-11-23 · **By:** Owner ("looks pretty good, let's go with this")
**What:** Direction I, Night List (D-049) is the app's look. Tokens in `packages/shared/design-tokens/tokens.json` now carry it: true black night (#000000, surfaces #161618 and #232326), white day, MGP green #2FE38A on night and #0E884E / #0B7A44 on day, unselected chips with no fill, and an Instrument Serif `marketing` family for ads only. The app loads Geist (400, 500, 600, 700) instead of Manrope; titles use 500.
**Defaults the owner can still change:** font Geist and green #2FE38A were the mockup defaults; the owner hasn't picked among the Tweaks. Switching to SF Pro or another green is a token change, not a rebuild.
**Contrast:** two shades moved slightly from the mockups so every text color passes 4.5:1 on every surface (tertiary gray #89898E night, #6B6B6F day; day secondary #4E4E53; day blue #2160EB; day green fill #0E884E so white text on it passes).

### D-051 Stories: what the story row opens (pending owner review)
**Date:** 2026-11-23 · **By:** Owner question ("what would it look like when people tap on it"), builder design
**What:** the circles at the top of Today open full-screen stories, built automatically from synced data (no videos or posts to produce, no running cost). Three kinds of circle: **Your Brief** (The Analyst's 3 things in your sports, written once a day per sport), **Moves** (one per big line move) and **Last Night** (finals and who covered the spread). A Move story has up to three frames: The Move (big number and the line's week as a step chart), Bets vs Money (only where splits exist: NFL and college football), and What to Know with the Signal. Each ends with Open Game, the game's bell and Share.
**Behavior:** progress segments at the top; about 6 seconds per frame; tap right or left to step, hold to pause, swipe left for the next move, swipe up for the game page, swipe down to close. The ring turns gray once watched and lights green again if the same line moves again, which pairs with line-move alerts. Opens with a zoom from the circle; Reduce Motion uses a fade; VoiceOver reads each frame and stops auto-advance.
**What counts as a big move (starting rule, tune with real data):** a spread move of 1 point or more since open, a total move of 1.5 or more, or any move across 3 or 7 in football; ranked by size within each sport.
**Share:** turns a story into a 9:16 card in the ad style (Instrument Serif and a ticket, D-049), with no team or league logos (trademarks, as with store art, D-009), "Odds via DraftKings" and "Gambling problem? Call 1-800-GAMBLER". Made on the phone, no server cost. Every share advertises MGP.
**Data it depends on:** line history (`odds_history`; the NBA and college basketball ID mismatch must be fixed first), splits (NFL and college football only), injuries (NBA only until the planned NFL, college football and MLB fix), ATS results (football and MLB) for Last Night. Your Brief is one Claude call per sport per day through the existing analyst function, grounded in synced data and descriptive only (no picks).
**Recommended scope:** v1 ships Move stories and Share (they reuse game page data). Your Brief and Last Night follow in v1.1, after the analyst's game_id work and ATS computation, to protect the mid-December submit.
**Mockups:** canvas page "Stories". Generators: `docs/mobile/design/generators/`.

### D-052 Stories parked; v1 tests sharing cheaply instead
**Date:** 2026-11-23 · **By:** Owner concern ("is there even an appetite for that, or are we building extra stuff to be cool"), builder recommendation
**Why:** the app's job is the game page: data to make a decision. The full story viewer, Your Brief and Last Night add build time before the mid-December submit and have no evidence of demand yet (the Nov 20 survey was simulated, so it can't prove appetite). Bettors already share bet slips and wins; whether they would share line moves is unproven.
**v1:** the Biggest Moves circles stay. Tapping one opens that game's page, scrolled to the line movement, with no separate story viewer. The game page gets a Share button that uses the iPhone share sheet: a short line ("Oregon −6.5, moved from −4.5") plus the App Store link. Each tap is counted in our own database, no new service.
**Test before building:** the owner can post a few line-move cards in the ad style on MGP's X and Instagram this week. Engagement there, plus Share taps after launch, decides whether the designed share card and stories get built in v1.1.
**Kept, not lost:** line history is on the game page; finals and who covered appear on Games once ATS is computed. D-051 stays as the design if the test says yes.

### D-053 The plot: splits and trends first, line movement second
**Date:** 2026-11-23 · **By:** Owner ("line movement is a distraction"; "% of money and % of the public on games, and trends, matter a lot more and are a lot harder to get in one place")
**North star:** give bettors the information that is hard to find in one place, concise and clear, so they can decide: **% of bets (the public) and % of money on every game, and trends**. Every screen and feature is judged against that. Many companies already sell line movement and "beat the line"; MGP doesn't lead with it.
**What changes:** line movement drops to supporting detail (the game page's odds block keeps "Opened −4.5"); it is no longer a headline, a status tag, a circle row or a story. The game page leads with Bets vs Money for spread, total and moneyline, then Trends, then What to Know. The Signal is built from splits and trends. The Today circles get a new job (owner to choose). The beat glyph stays as the MGP mark but no longer means "line moved".
**Data reality (Nov 23):**
- Splits (DraftKings % of bets and % of handle) exist for NFL and college football, but have been frozen since **Nov 2** on the website: DraftKings redesigned its splits page and our parser skipped every game. Fixed in code the same day (`supabase/functions/sync-betting-splits/parse.ts`, tests with Nov 23 captures); goes live when the function is deployed.
- The same free DraftKings page lists **NBA and college basketball** splits today, so adding them costs nothing but build time. MLB appears there in spring.
- Trends: ATS and over/under records are computable for football and MLB from results plus closing lines; NBA and college basketball need the `odds_history` ID fix first. Split history starts Sep 23, 2026, so "how the public side has done" covers this season only.

### D-054 All four trend types; no circles; Claude deploys backend fixes
**Date:** 2026-11-23 · **By:** Owner
**Trends:** the game page shows all four: ATS records (overall, home and away, as favorite and underdog), over/under records, how teams have done this season when the public or the money was on them, and form and matchups (recent results, head-to-head, rest, back-to-backs, short weeks). Football and MLB first; basketball once `odds_history` IDs are fixed.
**Circles:** removed. Today opens straight to the game list. The Stories designs (D-051) stay on the canvas as a record only.
**Deploys:** the owner gave Claude a Supabase personal access token through the secure form. It is stored only on the new personal cloud environment "mgpanalytics" (16 allowed hosts, a setup script that runs `npm install` in the repo and in `mobile/`), not on the owner's Default environment, and never in the repo or chat. The network proxy injects it into requests to `api.supabase.com`; run the CLI with a placeholder token (see RUNBOOK). A developer taking over uses their own token.

### D-055 Packaging public betting data: Today rows, a Pulse tab, splits-first game page (pending owner review)
**Date:** 2026-11-23 · **By:** Owner ask ("think long and hard about how to package all of this"), builder proposal
**What:** every Today row states where the money and bets are and flags Money vs Bets when they disagree (the beating pulse now means that); a **Pulse** tab replaces Insiders (which waited on the X API) with three views, Bets & Money leaderboards, generated Trends and Results receipts; the game page opens on Bets & Money, then Trends. Trends come from a template engine over results and closing lines (nflverse for NFL since 1999, CollegeFootballData for college football, MGP's own lines), never from the AI, with sample floors and a strength ranking. Early 100% / 0% splits are held back as "Too Early".
**Proof:** reproduced an analyst's trend exactly from free data, and MGP's own stored splits already yield season receipts (side with the most money 42-56-5 ATS, NFL Weeks 3 to 9).
**Not possible for free:** prop and touchdown scorer splits, ranking by bet volume, other books' numbers.
**Details:** `docs/mobile/proposals/2026-11-23-pulse.md`. Mockups (real data): canvas page "Splits First · Pulse".

### D-056 Basketball splits: splits only, no second line; games we don't store are counted, not guessed
**Date:** 2026-11-23 · **By:** Builder (owner direction D-053: add NBA and college basketball splits)
**What:** `sync-betting-splits` also stores DraftKings' % of bets and % of money for the NBA (DK event group 42648, October to June) and men's college basketball (92483, November to April). Nothing shows them yet: the website and the chat read stored splits for NCAAF and NFL only (`SPLITS_SPORTS`), and both chat reads now filter on sport so basketball rows can't slip into a football answer.
**No lines step for basketball:** NBA and NCAAB lines on the website come from BallDontLie (four books), so the function writes no competing DraftKings line to `betting_lines`. Basketball split rows keep DK's page number for audit and no opening line.
**Matching:** NBA on the nickname, like the NFL ("POR Trail Blazers", "PHO Suns"); NCAAB on the school name, like NCAAF, plus four aliases seen failing on Nov 23 (Saint Bonaventure, St. Johns, MD Eastern Shore, A&M-Corpus Christi). Basketball uses a 12 hour kickoff window (football keeps 36) so a DK event never lands on the same two teams' other game.
**Coverage:** our basketball games tables hold only part of DK's list. `ncaab_games` keeps ranked games in the next 24 hours (4 of DK's 39 college games on Nov 23); `nba_games` runs about 48 hours ahead. A DK game with neither team on our rows is counted and logged as "not in our games" rather than as a miss, unless the run matched nothing while we hold games in DK's range. Splits on every college game need `sync-ncaab-games` to store every Division I game.

### D-057 Leaderboards join Pulse; backfill college football lines (pending owner review with D-055)
**Date:** 2026-11-23 · **By:** Owner example ("Best College Football teams against the spread this year"), builder proposal
**What:** Pulse gets a fourth view, **Leaders**: best and worst against the spread and most overs or unders, per sport, each team tappable. Trends quote a team's rank when it is top or bottom 5 ("Louisiana Tech is 10-1 ATS, best in college football"). The proposal now keeps an insight catalogue (`proposals/2026-11-23-pulse.md`) listing every insight type, its source and status; new examples get a row before they get built.
**Data:** reproduced the owner's list from MGP's own stored closing lines (562 college games since Sep 24). A one-time backfill of Weeks 0 to 3 from CollegeFootballData (key already held) makes records full-season. Use ESPN's dark-mode logo variants so dark logos stay visible on black.

### D-058 Deploy football splits now; basketball stays off until the website chat guard ships
**Date:** 2026-11-23 · **By:** Builder (deploy safety)
**Why:** the live website's chat (`src/services/chatbot/storedSplits.ts` on main) reads every sport's stored splits with no sport filter. With NBA and college basketball rows in the table, a football question about a school ("public betting Alabama") could be answered with that school's basketball game. The filter exists on this branch but reaches the website only when the branch merges to main (owner's call: it also ships the Title Case and rank changes).
**What:** `sync-betting-splits` has `BASKETBALL_SPLITS_LIVE = false`; scheduled runs write NFL and college football only, dry runs can still test basketball. Only `sync-betting-splits` is deployed now (the Nov 2 parser fix). When the branch's website changes are live: flip the switch, deploy `sync-betting-splits` and `gemini-chat` (its splits guard), and check the first run.
**Checked before deploying:** the live `sync-betting-splits` (v11, Sep 24) and `gemini-chat` (v72, Sep 25) match the last code on main, so a deploy from this branch ships only this branch's changes.

### D-059 Pulse is the tab; Insiders lives inside it, from free sources
**Date:** 2026-11-23 · **By:** Owner
**Tab:** "Pulse" replaces the Insiders tab (Bets & Money, Trends, Leaders, Results). Insider content becomes a section inside Pulse and on each game page, not its own tab. Tabs: Today, Games, Pulse, Alerts, The Analyst.
**Insider sources (free, no X API):** latest episodes from betting podcasts and YouTube channels the owner picks, shown as headline plus link, read from public RSS feeds (YouTube offers a per-channel RSS feed, so no API key is needed); and DraftKings Network articles listed beside each game on the splits page we already read (thin today: about 2 of 10 NFL games, none for basketball). Bluesky and Reddit were not chosen. Headlines and links only, never copied content.
**Sources picked by the owner (Nov 23):** Bear Bets (FOX Sports, @bearbetspod), Hold The Phone (@HoldthePhoneShow), Bookit Blitz (@BookitBlitz). Channel IDs and feed URLs live in `supabase/functions/_shared/takes-sources.ts` (renamed from insider-sources.ts, D-060); all three feeds verified. Plan: tag each video to a game when its title names both teams ("Bengals vs. Commanders MNF Picks"), show untagged ones in Pulse by sport, and leave out Shorts. Their picks are theirs, credited by name; MGP itself still gives no picks.
**Also Nov 23:** owner confirmed the Apple Developer Program is approved for the LLC. Website changes opened for merge as jerryvix/mgpanalytics#23.

### D-060 "Takes": outside voices, with their picks listed plainly
**Date:** 2026-11-23 · **By:** Owner ("they're not our insiders… people want reputable sources, real opinions, not just what a computer tells them")
**Name:** the section is **Takes** (inside Pulse and on each game page). It is never called insiders.
**Format:** one bold line per pick, credited: "Chris \u201cThe Bear\u201d Fallica @chrisfallica · Bears +11.5 (−110)". Under it, a dropdown with a direct quote or a short summary of their reasoning and the risks they name, the show, the date, and a link to the exact moment in the episode so anyone can check it. MGP's own numbers for that game sit beside it (bets, money, trends), so a human take and the data are read together.
**Trust rules:** only shows the owner picks; a pick is shown only when the person states it (team and number) in the source; every pick links to the original; their picks are theirs, MGP gives none.
**Found Nov 23 from the shows' own descriptions:** Bear Bets: Chris "The Bear" Fallica (@chrisfallica), Geoff Schwartz (@geoffschwartz), Sammy Panayotovich (@spshoot), show @bearbetspod, plus Will Hill and Bruce Feldman; Hold The Phone: show @holdthe_phone (platform unconfirmed), hosts listed as doctorlocks.md and glue.guy; Bookit Blitz: @bookitsports, BookitHQ. X accounts unverified (no X access).
**Constraint:** picks are spoken in the episodes, not written in descriptions. YouTube video pages and transcripts are off limits (captcha, terms). Bear Bets publishes a podcast feed (Apple Podcasts ID 1704233690), so its audio can be turned into text; the other two may be video only. How to capture picks is the owner's call (see the Nov 23 question).

### D-061 Takes picks come from podcast audio (cost pending owner OK)
**Date:** 2026-11-23 · **By:** Owner ("auto from podcast audio")
**Pipeline:** for each show with a podcast feed, a nightly job takes new episodes, a speech-to-text service turns the audio into text with speaker labels (who said what), and Claude (Opus 5.5, the account the site's chat already uses) pulls out each person's picks: team, line and price only when said out loud, plus a short quote or summary of their reasoning and the risks they name, and the minute it was said. Every pick links to that minute. Nothing is shown when the text doesn't state a pick clearly.
**Coverage:** Bear Bets (Apple Podcasts 1704233690) and Hold The Phone (Almost Friday Media, presented by BetMGM, Apple Podcasts 1760085357) publish audio. Bookit Blitz is video only (no podcast found), so its picks can't be captured automatically.
**Cost estimate (Nov 23, to confirm on the vendor's own pricing page at signup):** about 5 episodes a week, roughly 15 hours of audio a month. Speech-to-text runs about $0.15 to $0.30 per hour of audio on the cheaper providers, plus a small add-on for speaker labels. Claude Opus 5.5 is $4 per million input tokens and $20 per million output; an episode is roughly 10,000 to 15,000 tokens in and a few thousand out, about $0.15 each. Total: roughly $5 to $10 a month. Needs a new speech-to-text account (recommended: AssemblyAI, for its low rate and speaker labels).
**Licensing:** summaries are short, credited and linked. Before MGP charges money, get the shows' permission or a licensing review; they may welcome the promotion.

### D-062 Takes run free: open-source transcription on GitHub's free minutes (replaces D-061's paid route)
**Date:** 2026-11-23 · **By:** Owner ("find me a free way… drop Bookit Blitz")
**What:** no paid speech-to-text. A GitHub Actions job downloads each show's newest pick episodes from its public podcast feed (Megaphone: `feeds.megaphone.fm/bearbets`, `feeds.megaphone.fm/holdthephone`) and transcribes them with open-source Whisper (`faster-whisper`, `small.en`, CPU) on GitHub's free runner minutes. Transcripts stay private; the app shows only short credited quotes and summaries with a link to the minute. Script: `scripts/takes/transcribe.py`; workflow: `.github/workflows/takes-transcribe.yml`.
**Why not YouTube captions:** YouTube answers automated page visits with a captcha and its terms forbid scraping; its official captions download works only for a channel's own videos. Neither podcast feed carries a transcript.
**Sources:** Bear Bets and Hold The Phone. Bookit Blitz dropped (video only).
**Still open:** who said which pick without paid speaker labels (plan: attribute from on-air cues such as "Bear, what do you like?", otherwise credit the show), and the extraction step's model and cost (owner's call).

**D-062 test, Nov 23 (GitHub Actions run 45265461702):** worked end to end at no cost. Hold The Phone "Best Bets Monday Night Football: Commanders-Bengals" (22:07 of audio) transcribed in 4 min 46 s; Bear Bets "5 NFL Week 11 Bets" (20:36) in 3 min 28 s; whole job 9 minutes. Every pick was in the text, for example Hold The Phone: Commanders +6, a +400 same-game parlay (Chase 75+ receiving, Daniels 25+ rushing, Diggs 50+ receiving, Chase Brown TD), Danny's Chig Okonkwo anytime TD; Bear Bets: Chris Fallica's Raiders team total under 15.5 (lost, Raiders scored 24), Sammy Panayotovich's Bears −11.5 (lost, won by 8) and Giants +6 (won, 23-18). Two picks weren't credited to a named host in the audio (Buccaneers +7, Jaylen Warren over 91.5), so they'd show under the show's name. Whisper misspells names ("Jamar Chase", "Mike Kaseke" for Gesicki, "Chig O'Conquo"); the extraction step matches them to MGP's player list. Shows swear; quotes shown in the app must be clean or paraphrased. Mocked as Pulse › Takes on the canvas with these real picks. A track record per show and person (won, lost, pending) comes free from MGP's results.
