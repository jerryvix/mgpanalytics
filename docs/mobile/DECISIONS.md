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
**Proof:** reproduced an analyst's trend exactly from free data, and MGP's own stored splits already yield season receipts (side with the most money 42-54-5 ATS, NFL Weeks 3 to 9; first written as 42-56-5, corrected Nov 23).
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
**Tab:** "Pulse" replaces the Insiders tab (Bets & Money, Trends, Leaders, Results). Insider content becomes a section inside Pulse and on each game page, not its own tab. Tabs: Today, Games, Pulse, Alerts, The Analyst (Alerts removed Nov 24, D-071).
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

### D-063 Takes extraction runs on Claude Haiku 5.5
**Date:** 2026-11-23 · **By:** Owner
**What:** the step that reads each transcript and pulls out every pick (team, line, price when said), who made it (only when named on air), the reasoning, the risks they named and the minute it was said runs on `claude-haiku-5-5`, through the Anthropic account the site's chat already uses. About 40 pick episodes a month, roughly $0.10 a month. Structured output (`output_config.format`) so every pick comes back in a fixed shape; misheard names are matched to MGP's player list before anything is shown; a pick appears only when the transcript states it. If quality falls short, Opus 5.5 is the fallback the owner can approve (about $5 a month).

### D-064 One text color; hierarchy from type, not grays (pending owner's font pick)
**Date:** 2026-11-23 · **By:** Owner, on the Takes screen ("the lighter text… feels Claude-ish… not tasteful… keep everything the same font color and play with different fonts to highlight different things")
**What:** on Takes, all text is the same white. Hierarchy comes from type: the pick in bold Geist, details (who, bet type, Why, Risks they named, MGP's numbers, status, section notes) in a second "detail" font. The canvas Tweak compares Geist Mono (uppercase, spaced), Instrument Serif italic and plain Geist. Won and Lost are words in the detail font, not green and red. Real show logos from each YouTube channel replace initials. The "Listen at 7:45" link is removed.
**Next:** once the owner picks the detail font, apply the same rule across the app (Today, Games, game page, the rest of Pulse) and update the tokens (one text color, a `detail` font family).

### D-065 Takes look forward only; no visible track records
**Date:** 2026-11-23 · **By:** Owner ("I don't want historical stuff… looking forward… we're not trying to track people's records… the point is real picks and why, so people know it's not a robot making the decisions")
**What:** Takes shows picks and early leans for games that haven't started, from each show's newest episodes. A take disappears from the app at kickoff. No won/lost results or records for shows or people anywhere in the app (MGP may keep results privately to judge which sources to carry). Each show's newest episode is transcribed even when its title doesn't say "bets", because early-week leans live in those episodes too (`--any-title`).
**Format changes:** same-game parlay legs listed one per line under the pick; "Risks they named" becomes "Risks Flagged" (owner wording); drop commentary about co-hosts disagreeing.

**D-065 test, Nov 23 (GitHub Actions run 45281035089):** Bear Bets' newest episode ("College Football Playoff Chaos", 55:00 of audio, no "bets" in the title) transcribed in 9 min 18 s, free. Forward-looking leans in it, priced with DraftKings' current line: Commanders +6 tonight (also Hold The Phone's pick, so the row shows both shows), Lions +2.5 on Thanksgiving ("the Bears should not be favored in Detroit"), Florida State +6, Minnesota +7.5, Arkansas +12.5 (DraftKings now +14.5), Southern Miss +5.5, Georgia Tech +35.5. Takes now groups rows under each game's header (matchup and kickoff), with no repeated day on the row; "Early Lean" marks a take the show hasn't bet yet.

### D-066 Takes layout: soonest game first, league tag, collapsed details, first-visit pointer
**Date:** 2026-11-23 · **By:** Owner notes, builder recommendation on sports
**Order and grouping:** Takes lists games by kickoff, soonest first, and groups picks under each game (not under each show), so shows that agree share one row with both logos. Each game header carries a small line above the matchup with the league in sportsbook shorthand and the kickoff ("NFL · Tonight 8:15 PM", "NCAAF · Sat 12:45 PM"; also NBA, NCAAB, MLB). The All Sports switch filters to one sport.
**Rows:** only the pick, its price and the show (person when named). "Early Lean" is gone. Why, Risks Flagged and MGP's own numbers for that side sit in a dropdown, closed by default. A same-game parlay reads "Same Game Parlay +400 (4 Legs)" with its legs listed one per line, always visible.
**Onboarding:** the first time someone opens Takes, the page dims and a pointer on the Takes tab says "Real Picks From Real People. See what popular betting shows are taking on today's games. Tap any pick for their reasons and the risks they see", with "Got It". This joins the first-launch pointers (D-037). Mockups: canvas boards "Takes, One Pick Opened" and "Takes, First Visit Pointer".
**Where the bets and money percentages come from:** DraftKings' public Betting Splits page on DraftKings Network (dknetwork.draftkings.com), which lists DraftKings customers' share of bets and share of money (handle) per side for spread, total and moneyline. MGP reads it every 4 hours (`sync-betting-splits`). One book only, so screens label it "DraftKings bets and money". Licensing check before any paywall.

### D-067 "Betting Splits" is the name; every splits line carries a number the bars don't show
**Date:** 2026-11-23 · **By:** Owner, on the Bets vs Money story ("'More money than bets on Oregon' so what? … This is AI slop and you're saying nothing. Change 'Bets vs Money' to 'Betting Splits' and make it the same white font… everywhere")
**Name:** "Betting Splits" replaces "Bets vs Money", "Money vs Bets" and "Bets & Money" as a label everywhere: the Pulse view, the game page's first section, the story frame. A leaderboard of the widest gaps between money and bets is "Biggest Splits". In sentences, "bets and money" stays fine.
**Copy rule:** a headline states the number and the side with its line ("74% of the money on Oregon −6.5"), never a restatement of the bars ("more money than bets"). Explainers of what bets and money mean are cut. The "so what" is how sides like this have done, from MGP's own stored splits and finals: "Sides with 70%+ of the money · 118-116-3 ATS" and "Money 20+ points ahead of bets · 51-60-3 ATS" (college football, Sep 24 to Nov 2); NFL Weeks 3 to 9: most money 42-54-5, 70%+ of the money 17-29-3, money 20+ points ahead of bets 5-12. These are descriptive records with their date range, never advice.
**Today rows:** the split line says both sides when they differ ("93% of money on CHA · 62% of bets on MEM"); the green "Money vs Bets" tag is gone.
**D-064 applied:** the owner accepted Geist Mono as the detail font ("the font is fine"). Pulse, Today, the game page and the stories now use one white for all text; small labels (sources, trend kinds, bar labels, date ranges) use Geist Mono uppercase.

### D-068 No Results tab; "Team Records" replaces "Leaders"; Takes subtitle
**Date:** 2026-11-23 · **By:** Owner ("we're not tracking results UNLESS you can pitch me… why it's aligned with my overall mission"; "Leaders is confusing"), builder recommendation on where results go
**Results:** the Pulse Results view ("how the money did", weekly) is dropped. A weekly recap is a look back, and the job is the next game. The same numbers stay, as context where a decision is made: the "how sides like this have done" line on Betting Splits (D-067), the Biggest Splits subtitle ("Sides like these are 5-12 ATS this season") and one Trends card. No standalone page tracks wins and losses.
**Team Records:** the Leaders view is renamed "Team Records". Sections: "Best Against the Spread (ATS)", "Worst Against the Spread (ATS)", "Most Overs", with no subtitles ("Covers minus misses" and "Fewest covers" removed). The header no longer shows a game count. College football first covered Week 4 on because MGP began storing closing lines Sep 24. Since Nov 24 it covers the full season: Weeks 1 to 12 (822 games, Aug 29 to Nov 22), on DraftKings' closing lines from CollegeFootballData, using the key already in Supabase secrets, through a read-only one-off function that was deleted after one call (`docs/mobile/research/2026-11-23-public-data/cfb_leaders_full_season.py`). One source for the whole season, because MGP's own snapshot is 1 to 3 hours before kickoff and CFBD's is the close; the two agree on cover or miss in 97% of Weeks 4 to 12 games. The header reads "2026 Season". Boards stop before a tie at the cutoff (the 6th-best team is an eight-way tie at 8-3, so Best shows 5).
**Pulse views now:** Betting Splits, Takes, Trends, Team Records. Week labels are Title Case ("Week 12 · Thanksgiving Week").
**Takes subtitle:** "Real Picks from Betting Experts" (owner wording) replaces "What the shows are betting".


### D-069 The Early Edge joins Takes; a sport mix from multi-sport shows; "Money" and "Bets" capitalized on Today
**Date:** 2026-11-23 · **By:** Owner ("they do nba too which is good, would be good to have a mix"; "can we capitalize 'Money' and 'Bets' on the Today tab"; "I see 'Bets and money' in all the mockups")
**The Early Edge (SportsLine):** transcribed free like the others (GitHub Actions run 45290598324, 14:50 of audio in 105 s). Its newest episode covers tonight's Bengals at Commanders: Mike McClure and Larry Hartstein take Bengals −6 and the under 54.5; McClure Joe Burrow O 7.5 rushing yards; host Sia Nejad Stefon Diggs anytime TD +180. It disagrees with Bear Bets and Hold The Phone (Commanders +6), which is the point: real people, real opinions. Prices are DraftKings' current line where MGP has it (Bengals −6 −113, Under 54.5 −103); props carry the price the show quoted. Two people on one pick are credited by last name ("McClure, Hartstein · The Early Edge") so the line fits.
**Sport mix, first result (run 45293121598, Nov 24):** The Early Edge's Monday morning show (43:18 of audio, 342 s to transcribe) gave tonight's basketball: NBA, Jarrett Allen U 15.5 Points (−120), Cavaliers at Bulls; college basketball, Under 154.5 (−105) in VCU vs Providence and Under 159.5 (now 158.5) in Colorado State vs Arizona, both at the Maui Invitational; App State +5 had already tipped off, so it is left out (D-065). Takes now opens on an NBA game at 8:00 PM, then the Bengals at 8:15 PM. The same morning show had a SportsLine over 53.5 on Bengals at Commanders that the later, game-specific episode contradicts; when one show's episodes disagree, the newest episode wins. **Sport mix:** `scripts/takes/transcribe.py` takes `--shows` and `--title-match`; the workflow also pulls each multi-sport show's newest NBA episode (titles matching NBA or a team nickname). Whisper misspells names ("Stefan Diggs", "Samaj P. Ryan"); the Haiku extraction step (D-063) corrects them against rosters before anything is shown.
**Labels:** on Today rows, "Money" and "Bets" are capitalized as the names of the two numbers ("78% of Money · 85% of Bets on CIN"). The source line reads "Betting Splits from DraftKings · Updated 3:05 PM"; "bets and money" no longer appears as a label anywhere in the mockups.

### D-070 Today rows: Public Bets and Public Money, then ATS context; team records in small print
**Date:** 2026-11-24 · **By:** Owner ("I'm leaning Option 2… sometimes the Public % can tell you absolutely nothing so want to provide more context into the game"; "'11 games in your sports' is pointless")
**Row (Option 2, default):** line 1 the matchup with each team's record after its name in small Geist Mono ("Trail Blazers 10-6 at 76ers 14-3"); line 2 the time, then the line in bold and the total ("7:10 PM · **PHI −3.5** · O/U 231.5"), moved off the first line so records fit; line 3 "PHI: **64%** of Public Bets · **78%** of Public Money" (team named once when both are on the same side; when they split, one line each, "MEM: 62% of Public Bets" / "CHA: 93% of Public Money"); line 4 the ATS record of the team the money is on, this season and at its venue tonight ("PHI **9-8** ATS this season, **4-5** at Home"; "on the Road" for the away team). Option 1 (stacked, Money first) and hiding records stay as Tweaks on the board for comparison. **Update Nov 24:** records are off by default (owner: "looked cleaner without it, will probably ask for it back"); with them off, the line sits beside the matchup again and row two is the time and total. The Records Tweak brings them back.
**Header:** "Today" over the date only; the game count is gone.
**Data:** splits from DraftKings (Nov 23 3:05 PM capture); records and ATS from ESPN schedules plus the DraftKings closing line ESPN keeps on each finished game (`docs/mobile/research/2026-11-23-public-data/today_ats.py`; every W-L matches ESPN's own). ESPN's ATS endpoint is empty this season, so the app's trend job computes ATS itself from closing lines, the same way.
**Copy:** "Public Bets" and "Public Money" (owner wording) on Today; DraftKings customers are the public here, and the source line says so.

### D-071 No Alerts tab; follow games with the bell; SportsLine credit
**Date:** 2026-11-24 · **By:** Owner ("still not sure what the Alerts tab is for… if we have alert buttons next to games… we can consolidate and make sure we tell people to sign up for notis"; "we can just call it SportsLine")
**Tabs:** Today, Games, Pulse, The Analyst. Following happens on the game: the bell on each game page and Games list row. Onboarding asks to turn on notifications (D-028, D-029, D-030 stand); notification settings and the list of followed games and teams sit under the profile button. Revises D-024 and D-059's tab list.
**Alerts themselves** (D-024 revised to fit D-053): kickoff soon with the latest splits, money moving to the other side on a followed game (checked about every 4 hours, never called live), new Takes on your games, finals for your teams. No line-move alerts.
**Takes credit:** a pick shared by two SportsLine hosts reads "SportsLine"; a pick by one named host reads "Mike McClure · SportsLine". The show's episodes are The Early Edge, but the brand people know is SportsLine.

### D-072 No partial time windows on screen; context is each team's season ATS
**Date:** 2026-11-24 · **By:** Owner, on the Betting Splits story ("why… Sep 24 to Nov 2? Feels very arbitrary… why that small time frame?")
**Why the window existed:** MGP began storing DraftKings splits Sep 24, and the splits sync was broken Nov 2 to Nov 23 (D-054). DraftKings publishes no history, so that gap can't be backfilled. A record that only covers those weeks reads as cherry-picked.
**Rule:** a number on screen covers a whole, unbroken period people recognize: this season, at home this season, since a named week when the trend itself starts there ("since Week 8"). No date ranges that expose a data gap.
**What changes:** the story's "How Sides Like This Have Done" becomes "This Season": each team's ATS record and its home or road ATS record (Oregon 6-5 ATS, 3-3 at Home; Michigan St 5-5-1, 2-2 on the Road; DraftKings closing lines via CollegeFootballData). The Biggest Splits subtitle, the game page's money-results callout and the "Sides with 70%+ of the money" Trends card are removed. Revises the "so what" in D-067 and the money-results placement in D-068.
**Money results come back** (how sides with 70%+ of the money, or money far ahead of bets, have done) once MGP holds a full, unbroken season of splits: from Nov 23, 2026 onward the sync is healthy and health-checked, so the 2027 seasons are the first clean ones. The partial numbers stay in `docs/mobile/research/` for internal use.

### D-073 Plain hyphens only; no em dashes, en dashes or minus signs anywhere
**Date:** 2026-11-24 · **By:** Owner ("don't use any em or en dashes. use a normal '-' for spreads i.e. (-6.5). Really every where on the site, I never ever want to see a em-dash, en-dash or any AI slop")
**Rule:** spreads, prices and ranges use the ASCII hyphen: "Oregon -6.5 (-110)", "-245 / +200", "5-7". No U+2014 (em dash), U+2013 (en dash) or U+2212 (minus sign) in anything a person can see: the website, the app, The Analyst's replies, Takes, alerts, mockups. Copy that used an em dash as punctuation is rewritten with a comma, colon or period. Replaces D-039's typographic minus sign.
**Applied Nov 24:** every board on the design canvas (version 50); the website, the shared odds formatter and The Analyst's prompt and display (background sweep, see STATUS); Takes text is cleaned on the way in (`plainDashes` in `ingest-takes`).

### D-074 Takes runs itself: twice-daily transcription, Claude extraction, live on the website
**Date:** 2026-11-24 · **By:** Owner ("for the Early Edge Basketball picks, I'm going to need you to go grab those each day by yourself and update the site"), builder design
**How it works:** `.github/workflows/takes-transcribe.yml` runs at 12:17 PM and 5:47 PM Eastern. It checks each show's newest episodes (plus each multi-sport show's newest NBA episode), skips ones already processed or older than 3 days, transcribes the rest with open-source Whisper on GitHub's free runners (D-062), and posts each transcript to the `ingest-takes` edge function. The function lists upcoming games from ESPN, has Claude Haiku 5.5 (D-063) pull out each pick matched to a game, cleans dashes, and stores it in `takes`; a newer episode replaces the same show's older spread, total or moneyline pick on a game (D-069). Nothing is stored for a game that has started.
**Website:** "Takes" is the first item under Market in the dashboard sidebar (`/dashboard/takes`): games soonest first, a league and time line above each matchup, one row per pick with the show's logo and credit, shows that agree share a row, Why and Risks Flagged collapsed (D-066). Picks leave at kickoff; no records (D-065).
**Security:** no stored secret. Each call to `ingest-takes` carries a GitHub Actions OIDC token that the function verifies against GitHub's public keys; only this repository's Takes workflow on `main` (or the working branch) is accepted. The function uses the Anthropic key already in Supabase secrets.
**Cost:** Claude Haiku 5.5 at about $0.002 per episode, roughly $0.30 a month at 4 to 6 episodes a day. GitHub runner time about 15 to 20 minutes a day, inside the free monthly allowance. Tables: `takes` (public read) and `takes_episodes` (service only), migration `20261124010000_takes.sql`, applied Nov 24.
**Goes fully automatic** once the workflow file is on `main` (GitHub runs schedules only from the default branch); until then each push to the working branch runs it.

### D-075 The one line per game: computed angles, fact-checked, no AI cost
**Date:** 2026-11-24 · **By:** Owner (the SportsCenter-stat idea: "take a game and distill it into something very simple... one additional data point... that can support one side or the other"; answers: fact only, football first, spread and totals, "I don't want to spend additional money on this"), builder design
**What:** for every game, one sentence with a record and a time frame that points to a side or a total, never a pick: "Dak Prescott is 12-3 ATS against the Eagles in his career", "Todd Bowles is 1-9-1 ATS as a favorite in prime time since 2011", "The under is 44-22 in Sean McVay's games as a home favorite since 2017".
**How (free):** no model. `scripts/angles/nfl_angles.py` reads every NFL game since 1999 with closing lines, coaches and starting QBs (nflverse) and builds every angle that is true for this game, for both teams, spread and total. The subjects are the QB's career, the head coach's career, and the team since 2024, this season, and since 2010 for rivalry and holiday angles. The conditions are home or road, favorite or underdog, this opponent, division, prime time, Thanksgiving, off a bye, short week, after a win or loss, and big favorite or underdog, with up to two conditions. These are the owner's buckets (home and away team, coach, QB, head to head, situation) done exactly in code rather than by agents browsing.
**Rules:** at least 10 decided games; a game in the last two seasons; 65% or better (or 35% or worse) and 2 standard deviations from a coin flip, with a fallback tier (62%, 1.6) only when a game has nothing stronger, then the stronger team's season ATS record. Each extra condition costs score; head-to-head and Thanksgiving angles get a boost. A check pass recomputes every chosen record straight from the raw file, and anything that doesn't match is dropped.
**Where it shows:** the first line under Betting Splits on the game page; the line under the splits on the story; on Today it replaces the "ATS this season" line when it's stronger; optional in the kickoff alert. The same sentence everywhere.
**Next:** run it on GitHub Actions each morning and store the lines in Supabase for the site and app; college football through CollegeFootballData (key already in Supabase secrets, called through an OIDC-gated function like `ingest-takes`); basketball once its line history is confirmed.

### D-076 Alerts are set once, not game by game
**Date:** 2026-11-24 · **By:** Owner ("Shouldn't it be like an overarching push notifications grouping?... It just wouldn't make sense to have to come in here and do that for every single game. What would be the user's process?")
**The process:** onboarding asks for sports, teams and notification permission, with the four alert types already on (Before Kickoff with the latest Betting Splits, Money Moves, New Takes, Final Score). From then on alerts arrive for your teams' games with no setup. Tapping the bell on any other game follows it in one tap with the same settings. Profile, Alerts is the one place to change the types and which games they cover (Your Teams, Games You Follow, and optionally Every NFL Game / Every NBA Game; games that start together come in one alert so a full slate doesn't flood the phone). The sheet a followed game's bell opens changes that game only, with Change for All Games and Unfollow. Revises D-071's sheet; mockups `JAlertSettings` and `JGameAlerts`.
**The line's placement (D-075), as mocked:** the game page shows it first under Betting Splits with the green pulse; Today shows it in place of the ATS line where the engine has one ("Joe Burrow is 33-15-1 ATS on the road in his career"). Every sport gets it as each one's history lands: college football next, then the NBA and college basketball.

### D-077 Today rows make room for the one line; Alerts lives in Profile
**Date:** 2026-11-24 · **By:** Owner ("LOVE that little note on Joe Burrow... go back to putting the Public Bets and Public Money in the same line so we can save space to add tidbit lines like that one... when we start pulling in NBA tidbits I want those replacing the ATS record stuff on the main Today page"; "alerts moved inside user profile settings... by clicking on the user icon in the top right")
**Today row:** Public Bets and Public Money always share one line, even when they're on different teams: "MEM 62% Public Bets · CHA 93% Public Money" (no colon and 13.5px so it fits a 375-point phone; checked at 375 and 390). The last line is the game's one line from the angle engine (D-075) wherever the engine covers the sport, and the money side's ATS record this season and at home or on the road until it does. As each sport's engine lands (college football, NBA, college basketball), its one line replaces the ATS line on Today. Revises D-070's split-across-two-lines rule.
**Profile:** tapping JV in the top right opens Profile: Alerts (first row), Your Teams, Your Sports, Appearance, Account, Help and Feedback, Sign Out. No Alerts tab (D-071). Mockup `JProfile`.

### D-078 Claude merges its own PRs once checks are green
**Date:** 2026-11-24 · **By:** Owner ("I give you permission to merge so I don't have to manually do it and I don't slow us down")
**Standing permission:** Claude may merge pull requests it opens on `jerryvix/mgpanalytics` into `main` without asking, once every check is green (the Vercel preview build at minimum), there is no merge conflict, and nothing in review comments is unresolved. Claude says in chat what went in. Anything that needs the owner (money, accounts, legal, taste calls) is still raised before the PR, not decided by merging it. This holds for future sessions until the owner revokes it.

### D-079 Ship a downloadable app first; college basketball waits
**Date:** 2026-11-24 · **By:** Owner ("Hold off on college basketball for now... I just want a product out there that's downloadable"; "shortest, most efficient path please")
**What:** v1 of the iPhone app covers the NFL, college football and the NBA. College basketball (its one line per game and its place in the app) is the fast follow right after launch (owner: "we will fast follow with adding in college basketball"); the existing college basketball splits sync keeps running at no cost, and MLB comes in spring. All build time goes to the app itself: Today, Games, the game page, Pulse, The Analyst and Profile with alerts, in Direction I, from the data already live (splits, Takes, the one line per game, trends). First TestFlight build as soon as the core screens work, then App Store review.

### D-080 The Analyst answers like the Claude app: Claude Sonnet with live web search
**Date:** 2026-11-24 · **By:** Owner ("when people ask it questions it should simply be Claude Sonnet answering and grabbing answers from the internet live if we don't have the answer on hand. Basically operating like a normal Claude app... priority for me is getting users on my platform")
**What:** The Analyst runs on Claude Sonnet 5.5 (`claude-sonnet-5-5`; `gemini-chat` is on Sonnet 4.6 today) with Anthropic's server-side web search tool. MGP's synced data (splits, lines, the one line per game, Takes, stats) goes in first; when a question needs something MGP doesn't have (injury news, a coach's quote, a stat outside our tables), it searches the web live and answers. Any number from the web names its source and time, since lines and injury status move. Same for the website chat and the app, one function.
**Kept:** no picks (no "bet this", "lock", or recommendations), per `docs/positioning.md` and App Store guideline 5.3 for gambling-adjacent apps. Answers stay descriptive.
**Later:** a per-user daily question limit (owner will set it); not at launch, because getting users on the platform comes first.
**Cost to watch:** Claude Sonnet 5.5 is $2 / $10 per million tokens plus about $10 per 1,000 web searches. A typical answer runs about one to three cents, a few cents more when it searches; 1,000 questions a day is roughly $20 to $50 a day. The question limit is the control.
**Replaces:** the earlier rule that market numbers come only from synced data (CLAUDE.md, positioning.md updated).
**Built Nov 24:** `gemini-chat` now calls `claude-sonnet-5-5` with effort medium (Sonnet 5.5 rejects `temperature`), `web_search_20260209` on every question (max 5 searches), server-side refusal fallbacks (`fallbacks: "default"`), and up to two `pause_turn` continuations; the request shape was checked against the API before deploying. A search question measured about 29K input tokens (about 6 to 8 cents). In the app: email and password sign-in with the website's accounts (Sign in with Apple later; Apple doesn't require it without social login), a one-time notice that answers come from Anthropic's Claude (App Store guideline 5.1.2), markdown answers with tappable sources, and starter questions. The existing 10-per-minute per-user burst limit stays; the daily limit comes later.

### D-081 Logos on the splits line; "Money Ahead of Bets"
**Date:** 2026-11-24 · **By:** Owner, in the first Expo Go preview ("change the team abbreviations here to logos"; "What does 'biggest split' mean?")
**Splits line:** each side's team logo (16 points) replaces its abbreviation: "[logo] 77% Public Bets · [logo] 75% Public Money".
**Board:** "Biggest Splits" becomes "Money Ahead of Bets", the sides where the share of money is furthest above the share of bets (fewer bets, bigger ones), each row showing both numbers ("80% Money", "46% Of Bets"). Revises D-067's board name.

### D-082 The Analyst learns from thumbs up and down
**Date:** 2026-11-24 · **By:** Owner ("there needs to be some type of feedback loop... thumbs up if it's a good response so the site can get better"), builder design
**Capture (built):** every Analyst answer has a thumbs up and a thumbs down. A thumbs down asks "What was off?" with one-tap reasons (Wrong Number, Out of Date, Didn't Answer, Too Long, Something Else) and an optional note. Each rating is saved in `analyst_feedback` with the question, the answer and its sources (people write and read only their own rows; review uses the service role). App first; the website chat gets the same thumbs next.
**Review (next):** a weekly summary: thumbs-up rate, thumbs-down grouped by reason, the worst answers with their questions. Shown in the web-only admin panel, free to run; a Claude Haiku write-up of the patterns costs cents a week if wanted.
**Fix and re-test:** each pattern becomes a change (a prompt rule, a missing data source, a formatting fix). Thumbs-down questions become a test set re-run before any Analyst change ships, so a fix doesn't break other answers.

### D-083 iOS signing: Expo holds the certificate; the owner names the App Store record
**Date:** 2026-11-24 · **By:** Owner ("Use my stored key"), builder setup
**What:** The first iOS distribution certificate (expires Nov 24, 2027) and App Store provisioning profile were created through the App Store Connect API with the owner's team key (Key ID 2VG9393J2B, team 4939734628, organization). Expo stores both and reuses them for every production build; `eas build -p ios --profile production --non-interactive` works from here on. The builder registered the bundle ID `com.mgpanalytics.app` (Apple ID LJ3F7APW8W).
**Key handling:** the owner approved one use of the key stored on Expo, inside the build sandbox, for the certificate and profile only. It sat in a private temp file for the setup and was deleted right after; it was never printed, committed or sent in chat. `api.appstoreconnect.apple.com` was added to this project's environment network list for it.
**Owner does:** creates the App Store Connect app record (the public App Store name is the owner's call) and sends its numeric Apple ID, which goes in `eas.json` as `submit.production.ios.ascAppId`.
**Push notifications:** not set up yet. Apple's API can't create an APNs key, so alerts will need one owner step later (OWNER_ACTIONS).
**Renewal:** the certificate needs replacing by Nov 2027; Expo flags it before it expires.
**Done Nov 24:** the owner created the App Store Connect record "MGP Analytics" (Apple ID 6838568637, SKU `mgpanalytics-ios`), now `ascAppId` in `eas.json`. The stored key is assigned on Expo for uploads, which run on Expo's servers. Build 3 (1.0.0) uploaded to TestFlight; Expo created the internal group "Team (Expo)" with access to all builds but added no testers, so no invite went out; with the owner's OK the builder used the key once more to confirm build 3 was ready for testing and add the owner to the group (Apple then sent the invite), and deleted the key copy after. TestFlight builds take over-the-air updates on the `production` channel.

### D-084 Apple Pay at checkout, on the website and in the app
**Date:** 2026-11-24 · **By:** Owner (shared a Stripe checkout with Apple Pay: "Make sure this is also an option for me")
**Applies when the paywall turns on (D-002); nothing is charged at launch.**
**Website:** subscriptions go through Stripe's hosted Checkout, the same page type as the example. Apple Pay shows on it with no extra setup (Google Pay too), at Stripe's standard card rate with no Apple Pay surcharge. Cancel and card changes go through Stripe's customer portal. If checkout is ever embedded on mgp-analytics.com instead of hosted by Stripe, register the domain under Payment method domains in the Stripe Dashboard first.
**iPhone app:** a subscription bought inside the app has to use Apple's in-app purchase (App Store guideline 3.1.1). Its sheet is Apple's own one-tap flow: Face ID or a side-button double-click, charged to the card on the person's Apple account, which is the same feel as Apple Pay. Apple keeps 15% under the App Store Small Business Program (enroll before charging) or 30% without it.
**US link to web checkout (decide at paywall time):** US apps can currently also show a link to web checkout (Stripe with Apple Pay) next to in-app purchase. Apple's fee on those purchases is before the Supreme Court as of Nov 2026, so check the rule and the fee before relying on it. In-app purchase must still be offered alongside it.
**One account:** a subscription bought on either path unlocks MGP on the website and the app through the same Supabase account (the entitlement hook, D-002).

### D-085 The Analyst doesn't name what powers it
**Date:** 2026-11-24 · **By:** Owner ("Don't tell it what's powering it... It almost takes away from the magic of it")
**Notice (app, shown once before the first question):** title "Meet Your Analyst"; "Your AI-powered analyst, here to answer your questions on games, odds, splits and trends"; then, smaller, "Your questions go to our AI partner to answer, so leave out personal info"; button "Got It". The notice key moved to v2, so everyone sees the new wording once.
**Why one line stays:** App Store guideline 5.1.2(i) requires telling people before their data goes to a third-party AI and getting their OK. It doesn't require naming the company, so the notice says "our AI partner" and the privacy policy names Anthropic.
**In answers:** the Analyst's instructions now say it's MGP's AI analyst and it doesn't name the model or company; asked what powers it, it says it doesn't share the details of the technology behind it. It never claims to be human.
**Replaces:** D-080's notice wording ("answers come from Anthropic's Claude").

### D-086 Lists end with the MGP mark and clear the tab bar
**Date:** 2026-11-24 · **By:** Owner, on the first TestFlight build ("I have to scroll down and hold to read the bottom sentence... maybe a site logo... at the very bottom")
**Fix:** the floating iOS tab bar covered the last row. Native tabs are meant to inset the first scroll view on their own, but that pass missed our lists, so Today, Games and Pulse set `contentInsetAdjustmentBehavior="automatic"` themselves (UIKit then insets by the tab's safe area, which includes the tab bar). The Analyst's composer sits above the tab bar through the tab's bottom safe area.
**Footer:** Today, Games and Pulse end with the MGP mark (the green pulse in its tile, as in the top bar) and "MGP Analytics" in the small mono label style. No links or legal text there; those live in Profile.

### D-087 Final games: winner bold, loser gray
**Date:** 2026-11-24 · **By:** Owner ("If a game is over, bold the winning team and whatever score they had, and then gray out the losing team... If the game hasn't started yet, keep it the way it is now")
**What:** on game rows (Today, Games) and the game page header, a final game shows the winning team's name and its score in semibold and the losing team's name and score in the tertiary gray. Upcoming and live games, and ties, stay as they were. The one exception to all-white text (D-064).

### D-088 No placeholder when Betting Splits aren't in yet
**Date:** 2026-11-24 · **By:** Owner ("If betting splits aren't available yet, you can just remove that for now... But if we have it bring it in")
**What:** game rows drop the "Betting Splits once the public weighs in" note, and the game page hides its Betting Splits section, until DraftKings posts real numbers. Placeholder splits (D-071's hold-back) still never show. The splits line appears on its own once the numbers arrive.

### D-089 Betting Splits on the game page: one row per side
**Date:** 2026-11-24 · **By:** Owner ("It is not clear at all what side is what. You're saying 80% of the money is on who?")
**What:** each market (Spread, Total, Moneyline) lists both sides on their own rows, each with its logo (or an up or down arrow for Over and Under) and its line, then its share of bets and its share of money under BETS and MONEY column labels. The bigger share in each column is bold. Example: "Miami OH +6.5 · 46% · **80%**" over "W Michigan -6.5 · **54%** · 20%". Replaces D-067's two-sided bars, which put the side names far from the numbers.
**Placeholders:** a market showing DraftKings' 100% / 0% placeholder (any share at 2% or less, or 98% or more) is hidden on its own, so a game can show a real spread split while its total and moneyline wait. The whole section hides when no market is real (D-088).

### D-090 The Analyst: direct call with failure codes; fixed room for the tab bar
**Date:** 2026-11-24 · **By:** Owner ("people can actually use the text bar or the chatbot... When I tried to use it just now, it wasn't working")
**What happened:** the owner's first TestFlight question ("How are the Bills ATS this season?") reached `gemini-chat` from the app (user agent MGPAnalytics/3) and got a 200 with a 780-byte JSON answer in about 20 seconds, yet the app showed "That one didn't go through". So the server and the Anthropic key were fine; the app failed to use a good reply. The exact client-side cause couldn't be seen from the server.
**Change:** the app calls `gemini-chat` with a plain fetch (session token, publishable key, 120-second limit), reads the reply as text and parses it itself, and names the failing step. A failed reply shows a small "Code: ..." line under the message and logs a row to `api_request_log` (provider `mgp-app`, the person's own row; migration `20261124040000_app_error_log`). Failed replies no longer go back to the Analyst as chat history.
**Tab bar:** the tab screens' safe area didn't include the floating tab bar on device (D-086's automatic inset didn't take), so tab screens reserve a fixed `TAB_BAR_SPACE` (home indicator inset plus 49 points): the bottom padding of Today, Games and Pulse, and the space under the Analyst's text bar. The text bar still sits right on the keyboard while typing.

### D-091 App icon and launch screen: the MGP mark
**Date:** 2026-11-24 · **By:** Owner (sent the glowing green "MGP" mark: "Can you make this the app logo")
**What:** the app icon is "MGP" in Space Grotesk Bold (the website's typeface and wordmark), green #5CC078 with a soft glow (the website's `glow-green`, scaled), centered on #121317. The launch screen shows the same mark on #121317 in light and dark mode, and the Android adaptive icon and web favicon match. These replace Expo's template icon and splash logo, which shipped in builds 1 to 3. Generator: `docs/mobile/design/generators/make_icon.py`.
**Ships in:** a new store build (icons and the launch screen are native, so an over-the-air update can't change them).
**Sharpened (owner, same day: "Sharpen up the image"):** drawn at 4x and scaled down, the mark is larger (about 74% of the icon's width) and the glow is tighter (close halo instead of a wide haze), so the letters stay crisp at home-screen size. Build 4 with the softer version was canceled before it shipped.

### D-092 Betting Splits bars in team colors, with the bet inside; national TV only
**Date:** 2026-11-24 · **By:** Owner (on the old two-sided bars: "it's not clear where the public's money is on... team's colors and their logos within the bar or notating what the bet was in the bar (i.e. MEM -2.5, O 212)"; and "wtf is dazn?")
**Splits:** each market has a Bets bar and a Money bar. Each bar is split into the two sides in their ESPN team colors (the alternate color when the main one is near-black or too close to the opponent's; text black or white by contrast). Each side's segment holds its logo (on a dark disc), its bet ("MEM -2.5", "MEM -148") and its share; Over is light gray and Under dark gray with "O 212.5" and "U 212.5". A narrow segment drops the words, then the logo, but always keeps its share (minimum 44 points wide). Replaces D-089's table and D-067's plain bars.
**TV:** the feed lists national channels only (ESPN marks each broadcast national, home or away), so local and team streams like "DAZN MEM" and "BlazerVision" no longer show; the game page hides the channel once a game is final.
**Feed:** teams now carry `altColor` (ESPN's alternate color) too.
**Revised same day (owner: "don't make it too busy. no need for the teams colors. use white and grey and the teams logos and odds"):** every bar's first side (away, Over) is white with dark text and the second (home, Under) is the theme's raised gray with white text. Team colors are gone; logos and odds stay inside the segments.

### D-093 Skinny splits bars everywhere; "Based on DraftKings"; Expert Picks all day
**Date:** 2026-11-24 · **By:** Owner ("I really like the skinny bar graphs... we just need to make it clear which side"; picked skinny bars on rows too; "Based on DraftKings (italicize it and shrink it). Remove the Updated... add that to Pulse"; "change that to Expert Picks... bring them back")
**Splits:** thin bars, white for the first side (away, Over) and gray for the second (home, Under), the bigger share bold. Game rows on Today and Games show the spread as two bars, BETS and MONEY, with each team's logo at its end. The game page shows each market (Spread, Total, Moneyline) with the two sides' logos and bets ("MEM -2.5", "O 212.5") above the matching ends of its Bets and Money bars. Replaces D-089 and D-092.
**Source line:** "Based on DraftKings" in Geist Italic, 12 points, no update time, on Today, Games, Pulse (Betting Splits) and the game page.
**Expert Picks:** the Pulse subtitle reads "Expert Picks". Picks stay up for 12 hours after their game starts; each shows Live during the game, then Hit, Miss or Push (Final when it can't be graded), and the game header shows the final score. Credit is the person when exactly one is known, else the show.

### D-094 The Analyst works like a normal iOS chat app
**Date:** 2026-11-24 · **By:** Owner ("make sure all the text works just like normal iOS... the keyboard won't swipe down... back buttons, keyboard going away, ability to copy and paste, ability to paste or add images... clear buttons, back buttons and new chat buttons"; "Save past chats")
**What:** answers and your own messages are selectable (iOS select and copy), and each answer has a Copy button next to the thumbs. The keyboard swipes down with the conversation (also on sign-in). The text box says "What can I dig into for you?", has a clear button while you type, and a + button to attach up to 4 images from Photos or paste one from the clipboard (shrunk to 1568 points, JPEG). New Chat and History buttons sit by the title; History lists your saved chats (the website's `conversations` and `messages` tables, shared both ways), opens one, or deletes one from its menu. The "Splits, trends, matchups and the news" subtitle is gone.
**Native:** adds expo-clipboard, expo-image-picker (photo library only; camera and microphone strings removed) and expo-image-manipulator, so it ships in a new store build.
**Updates:** the runtime version now follows the native fingerprint, so an over-the-air update only reaches builds with matching native code (an update using these modules would crash build 5).

### D-095 The bet is written inside the splits bar
**Date:** 2026-11-24 · **By:** Owner ("inside the actual bar, just put the bet. So if the bet was MEM -2.5 just include that... written within the actual skinny bar")
**What:** the slim bars grow just enough to hold a line of text (17 points on game rows, 20 on the game page) and each side's bet ("MEM -2.5", "O 212.5", "MEM -148") sits inside its segment, dark on the white side and white on the gray side, when it fits; a narrow segment shows only its color. The game page drops the side labels above the bars. Shares stay outside the ends; game rows keep the logos at the ends.

### D-096 Betting Splits: "Leader First" lines with thin bars
**Date:** 2026-11-24 · **By:** Owner ("quickly glance... okay, OKC -5.5, 89%, bam... the public is 80% on the under and 71% of bets are on Memphis... I really like the skinny bars... no coloring book... come back to me with 3 different options along with your recommended")
**Options built and shown side by side (real games):** 1 Leader First: per line, BETS or MONEY, the side's logo or arrow, its bet ("MEM -2.5", "Under 212.5"), its share, then a thin bar filled to that share. 2 Both Ends: line and share at each end of a thin bar, the bigger side bold and the other gray. 3 One Sentence: "MEM -2.5: 71% of bets · 80% of money" (money in MGP green) over two hairline bars.
**Shipped:** option 1 as the default, on game rows (spread, compact) and the game page (every market). It answers "where is the public and how much" in one read, names the side for totals ("Over 212.5 68%", "Under 212.5 79%"), keeps bars 4 to 5 points, and uses no team colors. Options 2 and 3 stay in `splits.tsx` (web preview `?splits=ends|callout`) so a switch is one line. Replaces D-093's bar layout and D-095.

### D-097 The Analyst as a wager thought partner; games since the last sync; images; saved sources
**Date:** 2026-11-24 · **By:** Owner ("a wager assistant... consider every question or request and think about potential angles, implications or assumptions one could gather and think how you can help them"; Ja'Marr Chase's last 5 games, asked right after Bengals at Commanders went final, left that game out)
**Approach (`gemini-chat` prompt):** the Analyst answers the question first, then adds at most two short angles a sharp bettor would want (splits after a loss, home or road, rest, injuries, line movement, public bets vs money), each verified from MGP's data or a web search with its sample and source, and asks at most one follow-up question, only when it helps. Still descriptive: no picks, no "bet this", "take the over" or "lock", and it doesn't grade bet slips. Replaces the old "always end with 2-3 exploration options".
**Recent form (`gemini-chat/recent-form.ts`):** on a "last N games", "this season" or "lately" question, the named player's MGP game logs go into the prompt (newest first, with totals), then every game his team kicked off after the newest logged game, by date, from the schedule, with the instruction to web search each one, count it if it's final and he played, and say which games the answer covers. A named team with no player gets its newest finals and the games after them with no final yet. If the schedule can't be read, the Analyst is told to check, never that the logs are current. MGP has game logs for the NFL, the NBA (through last season so far) and MLB.
**Images (`gemini-chat/images.ts`):** a user message can carry `images: [{ mediaType, data }]` (base64, no data: prefix). They go to the model as image blocks before the text, at most 4 per message and only on the latest 2 user messages (older ones keep their text and a one-line note). HEIC is skipped with a note asking for a screenshot. League and intent detection still read the text alone; a request without images is unchanged.
**History:** `messages` gains a nullable `sources` jsonb (migration `20261124065000_messages_sources`) so a saved answer keeps its web sources ([{ title, url }], as the function returns them). Nothing else about history is server-side.

### D-098 Expert Picks pipeline: every new episode, graded results, Daft Previews
**Date:** 2026-11-24 · **By:** Owner ("all the early BearBets picks are gone!? Bring them back!!"; picks stay up all day with results; NBA shows Daft Previews and Final Round Sports, titles and descriptions only)
**Why picks went missing:** Pulse hid a pick at kickoff, and the workflow took only each show's 2 newest episodes per run, so Bear Bets' "5 NFL Week 11 Bets" (third newest) was never read. One SportsLine episode failed to save because the same pick appeared twice in it.
**Pipeline:** each run reads every unprocessed episode from the last 3 days (up to 6 per show, newest first), skips titles about other sports, and keeps going past a bad feed or download. Duplicate picks in an episode are merged. A pick is dropped when either team has played since the episode came out (this caught Hold The Phone's Week 11 parlay legs stored against Week 12 games; the 3 bad rows were deleted).
**Results:** app-feed keeps picks for 12 hours after kickoff and adds `state`, `result` (hit, miss, push or null) and `final` ("WSH 22, CIN 20"). Spreads, totals, team totals and moneylines grade from the final score; player props from the ESPN box score (points, rebounds, assists, threes, combos, yards, receptions, touchdowns and more); parlays hit only when every leg hits. Ungradable picks show Final. Pure grader in `supabase/functions/_shared/takes-grade.ts` with 20 tests on real ESPN box scores.
**Credit:** a person only when exactly one is named; otherwise the show.
**Daft Previews (NBA props):** read from each new video's title and description through YouTube's public channel feed (allowed); its descriptions list the picks. Credited to the show (no host named); initials stand in until it has a logo.
**Final Round Sports:** not added. Its descriptions say the plays are in a pinned comment, which the public feed doesn't include, and reading comments or captions would mean scraping YouTube.
**Known gaps:** the Haiku extractor keeps only picks a host clearly endorses, so it can miss softer leans (Bear Bets' CFP episode gave 1 of about 5); college basketball picks stay out of Pulse until NCAAB ships.

### D-099 Pre-submission audit: server and security fixes
**Date:** 2026-11-24 · **By:** Owner ("do a pass for security, make sure onboarding... smooth"; cap of 50 questions a day), builder audit
**Account deletion:** new `delete-account` function: checks the person's token itself, deletes their conversations (messages cascade), api_request_log, analyst_feedback and analyst_usage rows, then the auth user (everything else cascades). Safe to call twice. Gateway JWT check off because the function verifies the token (the project signs ES256).
**The Analyst's limits:** at most 50 questions per person per day, counted in US Eastern time (`analyst_usage` table, service-role-only `increment_analyst_usage`; 429 "Daily limit reached"), on top of the 10 per minute burst limit. Requests are validated (roles, string content, images only through `images`, the newest question at most 4,000 characters); long chats are trimmed to the latest 20 messages and 30,000 characters instead of failing. An Anthropic spend limit is the owner's backstop (OWNER_ACTIONS item 10).
**Removed:** `test-bdl`, a public test function with no auth that showed part of an API key. Not touched (no source in the repo): `fantasy-trade-grader`, `sync-nfl-odds`, `sync-nba-props`.
**app-feed:** rejects malformed `date` and game `id` (400).
**Passwords:** at least 8 characters and checked against known leaked passwords (website copy updated).
**Open, owner:** custom SMTP (Resend) so confirmation and reset emails arrive (OWNER_ACTIONS 9), support email (11), privacy policy and terms approval (drafts in `docs/legal/`). **Open, builder:** limit the ingest functions' OIDC check to `main` once the branch is merged.

### D-100 Pre-submission audit: app fixes
**Date:** 2026-11-24 · **By:** Owner ("do one more pass for any bugs... make sure onboarding for people is smooth and clear"), builder audit
**Welcome (first launch):** a one-time screen before anything else: what MGP does (Betting Splits, trends and Expert Picks for NFL, college football and NBA games; the Analyst), an "I'm 18 or Older" button that's required to continue, and "Gambling problem? Call 1-800-GAMBLER". Built with expo-router's protected routes; the splash stays up until the flag is read so the tabs never flash. Shown as a plain screen (not a modal) since it's the only screen at that point.
**Sign-in:** Forgot Password (reset link through the website's callback; also lets Google sign-up users set an app password), Resend Email for unconfirmed accounts, friendly error sentences, new passwords 8+ characters (sign-in still accepts older 6-character passwords).
**Profile:** placeholder rows and "Preview Build" removed; Contact Support (mailto), Privacy Policy and Terms of Use links, 1-800-GAMBLER (tel), and Delete Account with a two-step confirmation that calls `delete-account` and signs out. Support email, policy and terms URLs live in `mobile/src/constants/links.ts` (support address is a placeholder until the owner sends it).
**The Analyst:** a reply that arrives after switching chats is dropped (request token); New Chat and History are off while answering; sign-out or a new account clears the chat; message keys are per chat so thumbs don't carry over; saves recover when the open chat was deleted and run one exchange at a time; only the last 2 user messages send images; auto-scroll only when a message is added; only https links open; image attach errors say so; the daily limit shows "You've reached today's 50 questions. Ask again after midnight Eastern".
**Everywhere:** first-load spinners; data refreshes when the app returns to the foreground and every 60 seconds while a game (or a pick's game) is live; Today rolls over after midnight; game links carry the game's Eastern date (with a fallback lookup without it); a root ErrorBoundary ("Something went wrong", Try Again); guarded dates; double-tap guards; unique list keys; History dates by calendar day.

### D-101 Only main writes production picks and game lines
**Date:** 2026-11-24 · **By:** builder (audit S5)
**What:** the GitHub OIDC check in `ingest-takes` and `ingest-game-lines` accepts only `refs/heads/main` (it still verifies signature, issuer, audience, repo and workflow path). The two workflows no longer run on pushes to the working branch; they run on their schedules from main and by manual dispatch. Unreviewed branch code can't write `takes` or `game_lines` anymore.

### D-102 X takes via external assistant, no paid API
**Date:** 2026-11-24 · **By:** Owner (X posts as a Takes source, no X API spend)
**What:** Public posts on X are a free source for Takes. There is no paid X API (D-021 and D-023 stay on hold for a general insider feed). An external assistant reads public posts twice a day with its own X access, extracts the structured items, and POSTs them to the `ingest-x-takes` edge function.
**Auth:** the function accepts a call only when the header `x-takes-ingest-secret` matches the Supabase secret `X_TAKES_INGEST_SECRET`. The value is never stored in the repo. `verify_jwt` is off because the function checks that header itself.
**Two kinds of item:** a pick (BookitWithTrent, Trent Attyah) is stored in `takes` with `source = x`, the post id, the post url, units when named, and a match confidence, and it shows in Takes like any other show. A market note (johnewing, John Ewing at BetMGM: ticket and handle share, open-to-now lines) is stored in `market_notes` and shown beside Betting Splits on the game page and on the website splits. A note is not a pick. A pick sent from the notes account is refused. Credit on screen comes from the registry in `takes-sources.ts`, and every item links to the post.
**Matching:** the same ESPN game list and matcher as `ingest-takes` (`games.ts`). Upcoming games, plus games in progress. A post that does not match one of those is returned as unmatched and not stored. Sending the same post id and pick (or the same post id and note text) again updates the row.
**Contract:** `docs/mobile/X_TAKES.md`. The owner sets the secret, runs migration `20261124180000_x_takes.sql`, and deploys the function. The builder does not.

### D-103 Traction: guest sessions, sign-up source, daily activity, admin Traction page
**Date:** 2026-11-24 · **By:** Owner ("I want signup info so I can track user traction"; turn email confirmation off until Resend; count installs anonymously; an admin page on the website)
**Auth:** email confirmation is off for now (`mailer_autoconfirm`), so sign-ups land signed in and nothing is lost to undelivered email; turn it back on once Resend works (OWNER_ACTIONS 9). Anonymous sign-ins are on.
**App:** every install runs as an anonymous guest (no name or email). Creating an account converts that guest (email, then password, on the same user; `signup_source: app`). The Analyst, History, feedback and Delete Account need an account; guests browse everything else. A once-a-day ping writes `app_activity` (US Eastern day, source app). Profiles allow a null email (guests) and copy the email when a guest converts.
**Server:** gemini-chat and delete-account refuse guests (403); conversations, messages and analyst_feedback writes require a non-anonymous user; `app_activity` accepts only today (Eastern, plus or minus a day) and the person's own rows.
**Website:** sign-ups carry `signup_source: web` (Google sign-ins count as web); signed-in visits write a daily `web` activity row. The admin panel's Traction section (admins only, `admin_traction` RPC) shows accounts, guests, converted guests, active today, 7 and 30 days, Analyst questions, feedback and saved chats, daily sign-ups (app vs web) and active users for 30 days, and the 20 newest accounts.
**Privacy:** the policy draft mentions the guest ID.

### D-104 Word from the Window: market notes read as posts from industry insiders
**Date:** 2026-11-24 · **By:** Owner ("restyle the Market Notes section so notes read as posts from industry insiders, not game data. Keep the current black/white terminal aesthetic")
**What:** on the app's game page and the website's game card, "Market Notes / From Public Posts" becomes "Word from the Window" (same type as Betting Splits), hidden when a game has no notes. Each note is a card (1 point #2a2a2a border, #111 background, 12 point radius, 13 point padding, 10 points between cards): the author's X photo (32 points, initials if it fails), name in bold with a blue check when verified, "@handle · 2h", the X mark, the post text, then "via BetMGM" and "View on X ↗" (opens the post). No team or line chips, so a note can't look like a pick; the "Market Note" label and the all-caps credit are gone. Small outlined DATA and EXPERT tags sit beside Betting Splits and Expert Picks in the app (the website's game card has no Expert Picks section, so only DATA there). Expert Picks logos are unchanged.
**Data:** the X registry (`supabase/functions/_shared/takes-sources.ts`, mirrored in `src/lib/xAccounts.ts`) carries `avatarUrl`, `verified` and `source` per handle (johnewing: verified, BetMGM). app-feed adds name, avatar_url, verified, source and posted_at to each note; the website reads handle, author_name and posted_at.
**App note:** the X mark is the 𝕏 character (the app has no SVG library and a new one would need a store build); the website draws the X logo.

### D-105 Player lines: one fact against the game's actual player prop
**Date:** 2026-11-24 · **By:** Owner (professional sports only, NFL and NBA; "look at what the player has done historically from many angles... measure against the actual prop number"; "get more creative than just recent home and away games... blitzed... a certain coach... how a team ranks in the league for Rush YPG or Pass Yds Allowed... just don't want it to be vanilla but again bubble up one to the top"; the app stays as simple as it is: one more little line), builder design
**What:** for every upcoming NFL and NBA game, the strongest true fact about one of its players measured against that game's DraftKings prop number, in one sentence with its record: "Travis Kelce has topped 43.5 receiving yards in 40 of his last 48 prime-time games", "Saquon Barkley has stayed under 15.5 carries in 12 of his last 15 games against the Cowboys". A fact, never a pick: no pick words, plain hyphens, no period.
**Where it shows:** the game page only, directly under the game's one line (D-075) and in the same style (green pulse, the record bolded), followed by the prop in small gray mono, normal case, `c.textTertiary`, 12 points: "(T. Kelce O 43.5 Rec Yds)", with that side's DraftKings price when the feed has one ("(J. Allen O 240.5 Pass Yds -110)"; formatted by `formatPropBet` in `packages/shared/odds/format.ts`). It shows even when the game has no team line, and not on final games. No new section, headshots or title. Today and Games rows are unchanged.
**Sources (free, verified Nov 24):** props from ESPN's core odds API, DraftKings (provider 100), `.../events/{id}/competitions/{id}/odds/100/propBets` (paginated): the main "Total ..." line per player and market, plus Anytime Touchdown Scorer graded against 0.5; milestone ladders, quarters, halves and first scorers are skipped. The feed carries the line but no price (its over and under items are identical), so `price` is stored as null and dropped from the display until a free source has it. NFL history from nflverse since 2018: weekly player stats, snap counts (a player who played with no stat row counts as a 0, so "his last n" never skips a game), PFR advanced stats (blitzes, pressures, yards before contact, missed tackles), schedules with coaches, roof, temperature, wind, rest and division, and players.csv for ESPN ids; downloaded each run in Actions (completed seasons cached). Upcoming NFL weather is ESPN's forecast temperature and indoor flag (no free wind forecast reached; wind is used only when ESPN's forecast says windy). NBA history from ESPN game summaries for every game in `nba_espn.csv` plus this season (`scripts/angles/nba_boxes.py`): one compact row per player who played, committed as `data/history/nba_players_espn.csv` (4.6 MB) and `nba_team_games_espn.csv` (possessions, national TV); this season is cached in Actions. Injuries ("Out" or injured reserve) from ESPN's game summary.
**Angles (`scripts/angles/player_angles.py`):** every condition true for this game, alone or in pairs: this opponent, its head coach (NFL), his former team, the opponent's defense this season as of each game (top or bottom 10 in pass, rush, points, sacks, yards to his position, yards before contact, missed tackles; blitz rate 30%+ or under 20%; pressure rate 25%+ or under 20%; NBA points allowed per 100 possessions and pace), who his quarterback is, his usual quarterback or a top teammate out, prime time, national TV, division, indoors or outdoors, under 35 degrees, short week, off a bye, back-to-backs and rest, after a 300-yard, 100-yard or 30-point game, after topping or being held under this number, after 38+ minutes, and plain splits (home or road, favorite or underdog, after a win or loss). Windows: his last three seasons, this season, since joining a new team (this season or last), his last 10, and every game in the data for rare situations. Each sample is literally "his last n" such games; a push counts as a miss for both sides.
**Rules:** at least 8 NFL or 10 NBA games, one in the last two seasons; at least 70% and 10 points above his own rate against this number in all his recent games, 1.75 standard deviations from a coin flip and 1.25 from his own rate (strong tier: 75%, 2.0 and 2.0); not a side he already hits 75% of the time; not contradicted by this season (with 4 NFL or 5 NBA games played, he hits that side at least half the time this season); not a trivial number ("0.5 receptions"); no "has not scored a touchdown". A pair of conditions must include a matchup condition, each half must point the same way alone, and the pair must beat both. Only featured players: the starting quarterback, the lead back and the top three receivers by their lines (NBA: the top four by points line). Ranking (coordinator and owner, Nov 24: "how many times a player gets blitzed vs. the defense... success against a certain coach... how a team ranks in the league"): among angles that pass the bar, the shown line prefers, in order, (1) the opponent's defense this season (ranks, blitz and pressure), (2) teammates and his quarterback (who his QB is, his usual QB or a top teammate out), (3) this head coach or his former team, (4) this opponent, (5) the setting (prime time, national TV, division, indoors or outdoors, cold, short week, bye, rest), (6) his own form, (7) plain splits, then no condition; an angle takes the best tier among its conditions. A sample mostly from before the last three seasons (a 48-game career span in prime time) ranks behind every fresher angle. Within a tier: strong ahead of fallback, then a score of hit rate, distance from a coin flip and from his own rate, sample size and how many markets the book offers on him, minus pairs and long sentences. The top 3 per game are stored (one per player, varied markets); rank 1 shows.
**Check pass:** before anything ships, each candidate's record is recomputed from the raw CSV rows (stat values, hits, sample size, home or road, opponent, prime time, division, roof, temperature, coach and national TV read again from the raw files), and its sentence is checked for its numbers, pick words and dashes. Nov 24: 183 of 183 top candidates matched (NFL 131, NBA 52), none dropped. `--self-test` covers wording, pushes, thresholds, ranking, tampering and gaps.
**Delivery:** table `player_lines` (migration `20261124200000_player_lines.sql`, public read, written only through `replace_player_lines`, which replaces a game's rows in one transaction); `ingest-player-lines` accepts only the game-lines workflow on main (GitHub OIDC, D-101) and refuses pick language. `.github/workflows/game-lines.yml` runs the engine after the team lines twice a day (NFL next 7 days, NBA next 2); a game whose props aren't posted yet keeps what it had. `app-feed`'s game view adds `playerLine` (rank 1: text, record, short_name, side, line, price, market_short and the rest). Nov 24's rows were seeded once from a local run (30 lines, 10 games; re-seeded after the preference order); the workflow replaces them from its next run on main.

### D-106 Player lines v2: game-specific angles, a ticker for context, a judge calibrated to the owner's taste
**Date:** 2026-11-24 · **By:** Owner (feedback on v1 and a taste test: "with Dak Prescott at quarterback" is useless if Dak was QB in all 14 games; "this is a Thanksgiving game, Thanksgiving angles matter"; "against the 10 defenses with the fewest missed tackles after a win" is word garbage; vary the verbs; "vs top-10 defenses" doesn't say whether tonight's opponent is one, so give context like a TV sports ticker; drop missed tackles; concise stat names; "does this sentence give someone the context they need to make a decision on the prop or the game?"; don't get templatized; build a judgment analyst calibrated to his taste), builder design. Revises D-105's wording, ranking and display.
**What changed in the engine (`scripts/angles/player_angles.py`):**
- **Missed tackles out:** missed tackles, yards before contact and pressure rate are gone. Blitz rate stays, ranked, with the ticker naming tonight's opponent's exact rank ("PIT DEF 2nd in Blitz Rate"), and the sentence stays plain ("vs the 10 defenses that blitz the most").
- **Special dates:** Thanksgiving (the fourth Thursday of November), Christmas, season openers, season finales, international games and off a bye. They need at least 5 games but 80% or better, and aren't held to the three-season freshness rule (they come once a year).
- **Tautology filter:** a condition must leave out at least a quarter of the player's games in the window (for his QB or a teammate, his games for this team). "This season" and "since joining" count only when they leave out a quarter of his recent games, and the second half of a pair has to leave something out.
- **Pairs:** one half must be about the matchup (defense, opponent, coach, teammates, weather). The other is a plain setting word: home or road, favorite or underdog, division, prime time, indoors, rest. "After a win" and form clauses stand alone.
- **Tickers:** every condition about a class of opponents carries a ticker with tonight's opponent's exact rank this season: "CHI DEF 7th in Rush YPG Allowed", "KC DEF 7th in Pass YPG Allowed", "DEN DEF 32nd in Rec YPG Allowed to RBs", NBA "DET 5th in Pts Allowed", "DEN 22nd in 3PM Allowed", "BOS 29th in Pace" (1st = fewest allowed, or most sacks, blitzes, pace).
- **NBA defense:** points allowed per game (not per 100 possessions, so the ticker is plain), threes allowed, pace ("fast-paced teams", "slow-paced teams").
- **Wording:** varied verbs (gone over, cleared, topped, gone for more than, been held under, stayed under, finished under, scored in) and short stat names (Pass Yds, Rush Yds, Rec Yds, catches, Pass TDs, Pts, Reb, Ast, threes). A perfect record reads "in 16 straight games"; "after a Cowboys win" when every game in the sample was for his team now.
- **Output:** the top ~12 verified candidates per game (at most 2 per player, 4 per angle type; samples mostly from older seasons only when fewer than 3 fresh ones exist), each with its draft sentence, record, family, angle type, ticker and the prop, plus the game's context (date, Thanksgiving and other special dates, prime time, roof, temperature).
**The judge (`supabase/functions/_shared/player-judge.ts`):** Claude Haiku 5.5 (`claude-haiku-5-5`, effort low, structured JSON output) picks one candidate per game and may polish its wording. Its rubric is the owner's feedback and taste test, quoted:
- liked: Dak Prescott over 263.5 Pass Yds in 5 of his last 6 Thanksgiving games; Lamb under 7.5 catches on Thanksgiving; Dak indoors; Lamb after a Cowboys win; Gibbs and Kincaid with their tickers; Stafford in prime time
- disliked: Goff "vs defenses that pressure a lot"; Cook "vs the league's surest-tackling defenses"
- the voice he picked: the plain sentence, not round numbers, ticker-style sentences or game logs

It returns `{candidate_id, sentence, show_ticker, reason}`.
**Checks in code (`_shared/player-lines.ts`, tests in `src/test/playerLines.test.ts`):**
- The judge's sentence must keep every number of the candidate (the line, hits and games, and no others), the player's full name, the stat name, every capitalized word (Thanksgiving, team and coach names, stat names), the side (no new over words on an under line or the reverse) and the record's exact form ("5 straight" can't become "all 5 of his", which would claim a whole career when the data starts in 2018).
- No pick words, no dashes, at most 40 characters longer than the draft.
- Otherwise the engine's draft is stored.
- A class-of-opponents line always carries its ticker.
- An angle type already shown on two other games is held back from the judge unless that leaves fewer than 3 candidates.
- The chosen line is rank 1; ranks 2 and 3 are the engine's next best for other players.
**Display:** the sentence in OneLineText style; under it one small gray mono line (`c.textTertiary`, 12 points, normal case): "{ticker} · {prop}" when there's context ("KC DEF 7th in Pass YPG Allowed · D. Kincaid U 3.5 Rec"), else just the prop ("C. Lamb U 7.5 Rec"), with the price appended when the feed has one. Replaces D-105's inline parenthetical. `app-feed`'s `playerLine` gains `ticker`.
**Delivery:**
- Migration `20261124230000_player_lines_v2.sql` adds `ticker`, `family`, `angle_type` and `chosen_by` (judge or engine).
- `ingest-player-lines` runs the judge with the project's `ANTHROPIC_API_KEY` (server side; OIDC gate unchanged; `dry_run` judges without writing). The workflow posts 4 games per call and carries the angle types across calls.
- The workflow now downloads only the PFR pass file of the advanced stats.
**Cost:** about 30,000 input and 3,700 output tokens for 11 games, $0.005 a run at Haiku 5.5 prices (twice a day: about a cent a day for a full slate).
**Seed (Nov 24):** today's 11 games with props were judged and stored through a one-off function with the same code, gated by a one-time token; the function and its secret were deleted right after. All 11 were the judge's wording, no fallbacks. Two of the three Thanksgiving games show a Thanksgiving line (Goff, Lamb).

### D-107 Player lines: short class names, "Top" and "Bottom" capitalized
**Date:** 2026-11-24 · **By:** Owner ("vs the 10 teams that allow the fewest threes" reads weird, same for the most threes; "Capitalize Top and Bottom always"). Revises D-106's wording for a class of opponents.
- A class of opponents is named the short way: "Top-10 three-point defenses", "Bottom-10 pass defenses", "Top-10 run defenses", "Top-10 scoring defenses", "Bottom-10 defenses against RBs", "Top-10 pass rushes" (most sacks). Without a number: "blitz-heavy defenses", "defenses that rarely blitz", "fast-paced teams", "slow-paced teams".
- "Top" and "Bottom" are always capitalized. The engine writes them that way, the judge's rubric says so, and the code check (every capitalized word in the draft must appear in the judge's sentence) holds the judge to it.
- The ticker still names tonight's opponent's exact rank ("WSH 8th in 3PM Allowed"), so the sentence doesn't need to.
- The lines already stored for Nov 24 to 27 were rewritten in place.

### D-108 App updates apply on the first open
**Date:** 2026-11-24 · **By:** Owner ("make the updates through to the app so I can see"), builder design.
- Left alone, expo-updates downloads an update at launch and applies it only on the launch after that, so every change took two restarts to show.
- Now (`mobile/src/lib/app-updates.ts`, used in the root layout): an update that finishes downloading within 10 seconds of opening the app reloads it right away, before there's anything on screen to lose. Coming back after a minute or more in the background counts as opening again: a waiting update applies, or the app checks and a quick one applies the same way. An update that lands later, while the app is in use, waits for the next return. Off in development and on the web preview.
- This change itself arrives the old way (two restarts). Every update after it shows on the first open.
