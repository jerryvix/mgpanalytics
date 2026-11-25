# MGP Positioning Record

**Audit date:** July 17, 2026 (full-codebase competitive audit: frontend features, data layer, chat/insights).
**Purpose:** the on-record list of what MGP can truthfully claim, what it must not claim, and why. Consumer copy (landing hero, `/why` page) must trace to this document. Internal and investor material may use analogy language ("Bloomberg terminal for bettors"); shipped UI copy may not.

> **Audit note, 2026-11-21 (facts changed since the July record; owner approval of the lines below is unchanged):**
> - Public betting % is now **real** for NFL and college football (DraftKings % of bets and % of money via `sync-betting-splits`); `PublicBettingPreview` no longer uses `Math.random`. It is still not available for NBA, college basketball or MLB.
> - **2026-11-23:** splits stopped updating on Nov 2 (DraftKings redesigned its splits page; the parser skipped every game). Parser fixed and tested the same day; live once `sync-betting-splits` is deployed. Until then the site shows Nov 2 numbers. NBA and college basketball splits are on the same DraftKings page and are next.
> - Books: since Aug 7, 2026, NFL, college football and MLB odds are **DraftKings only** (ESPN feed). NBA and college basketball have 4 books. Don't claim "4 books" across all sports.
> - NFL advanced stats on the player page still use `Math.random` (`src/utils/advancedStatsCalculator.ts`).

---

## Confirmed competitive advantages (ranked by defensibility)

### 1. The grounded analyst: an AI that is architecturally blocked from inventing numbers
**Where:** `supabase/functions/gemini-chat/index.ts` (runs Claude Sonnet 4.6, not Gemini — the name is legacy).
**What's real:** market questions are classified (`MARKET_SPECIFIC` / `CONTEXTUAL` / `FACTUAL`) and market numbers may only come from synced Supabase data injected as `[MGP DATA]`; LLM memory is forbidden for lines. Since D-080 (Nov 24, 2026) the Analyst may search the web live for anything MGP does not have synced, naming the source and time of any number it finds; synced data still comes first. Stat leaderboards and MLB hit streaks are marked AUTHORITATIVE in-prompt so the model cannot contradict the dashboard. Odds older than 6h trigger a staleness disclosure. Guardrails prohibit pick-selling language ("should bet", "lock").
**Why defensible:** this is prompt-plus-retrieval *architecture with teeth* (prohibited-phrase lists, mode gating, authoritative blocks), not a marketing wrapper. Competitors bolt chatbots onto content; an analyst whose market numbers provably match the product's own boards is rare, and trust compounds. Hard to fake, easy to demo ("ask it for a line, check it against the board").

### 2. The verified-insight integrity process
**Where:** `src/data/trendingBets.ts`, `src/data/edges.ts`, `src/test/nuggetIntegrity.test.ts`, `docs/nugget-grading.md`.
**What's real:** every curated angle carries `source` + capture date; a `verified` boolean gates rendering (unverifiable content never ships); a CI test enforces sources, blocks hedge words ("reportedly", "rumored"), and formats; a documented human factual-grading pass sits behind that. Provenance is rendered on every card ("source … odds as of …", staleness warnings after 7 days).
**Why defensible:** it's an editorial standard enforced *in the codebase* (a test suite is a release gate competitors can't see or copy from outside). The trend-content category is dominated by volume publishers; a receipts-on-every-claim posture is a brand moat that gets stronger with every correct claim.

### 3. Decision-surface fusion with honest math
**Where:** `src/lib/odds.ts` (probability-space consensus; American odds are never averaged arithmetically), `sync-odds-snapshot` → `odds_history` (line movement), ESPN 60s live polling, MLB StatsAPI (hit streaks, career batter-vs-pitcher), fused in the Game Insights sheet, Today's Board, and the hit-streaks table.
**What's real:** 4 books synced (DraftKings, FanDuel, Caesars, BetRivers; +BetMGM on props), open-to-current movement with correct steam/drift semantics, live game state, streak and matchup intel in single screens.
**Why weakest:** each ingredient is commoditized (OddsJam/Unabated do multi-book at 50+ book scale; Action Network owns trend content). The fusion and the correctness of the math are the experience, but a funded competitor could replicate the surfaces. Position it as proof of philosophy ("the math done right, all in one place"), not as the headline.

**Honest bottom line:** #1 and #2 are the same story told twice — *MGP does not make things up* — one enforced by architecture, one by process. That story is the positioning. #3 is the visible product that makes the story tangible.

---

## DO NOT CLAIM (audit-verified as untrue or not built)

| Claim | Reality |
|---|---|
| Kalshi / prediction markets coverage | Zero code. Appears only in landing-hero copy and one comment. |
| Live futures tracking | `src/data/propFutures.ts` is a static snapshot (Matchbetwin, 2026-07-15), static by explicit owner decision. |
| Public betting % / sharp money indicators | `PublicBettingPreview.tsx` is `Math.random()` mock on NFL/NCAAF/NCAAB. Cleanup task already spawned. |
| NFL advanced tracking stats (pressure rate, separation, etc.) | Partly `Math.random()` in `src/utils/advancedStatsCalculator.ts`. |
| 50+ sportsbooks | We sync 4 (5 on props). |
| Real-time / tick-level steam alerts | Snapshots run ~6h; steam heuristic rarely triggers at that cadence. |
| "Powered by Gemini" | The live analyst is Claude Sonnet 4.6 (`gemini-chat` name is legacy). |
| Rich prop-grading analyst in chat (EPA, CPOE, target share) | That code lives in the deprecated, unmounted `useChatQuery` path. Users never see it. |

## Shipped pitch lines (approved July 17, 2026, rev 2; research framing Nov 25, 2026)
- Landing hero: "The numbers behind every game" / "Stats. Trends. Market data. One screen"
- /why hero: "Know every matchup. Get real insights"
- App Store subtitle: "The Numbers Behind Every Game"; TestFlight and store copy: "your sports research app"
- Retired Nov 25: "Get an edge on the books.", "Live odds. Line moves.", "Bet Smarter, Not Harder."
- /why card headers: "No guesses. Just real numbers." · "Get specialized data and insights." · "Stop checking multiple apps."
- Cut by owner direction: platform name-drops on the landing subhead (retires the Kalshi flag), the /why contrast grid and the "what we do not do" card.

## Consumer voice rule (owner-set, July 17, 2026)
Positive claims only on consumer surfaces. No defensive framing: nothing about hallucination, staleness, unverified claims or AI memory. Consumers are not doubting the data until copy plants that seed. The integrity story stays real in the product (provenance on cards, staleness warnings in chat) and in this doc; it is not marketing copy.

## Research framing (owner, Nov 25, 2026)
MGP presents sports data. Marketing surfaces (App Store and TestFlight copy, the website's public pages, link previews, social) lead with research, analytics and data, not betting: sports betting isn't legal everywhere, and MGP is a sports information app. What keeps MGP on the right side is what it does (no wagers, no money held, no sportsbook links or promos); the framing keeps the marketing out of gambling promotion.
- Say: research, analytics, stats, trends, matchups, historical records, market data, public sentiment, the numbers behind every game, know the matchup.
- Don't say in marketing: bet, betting, bettors, wager, gamble, sportsbook, "edge on the books", picks (other than the Capper Picks section name). Never "predictions" or prediction markets: MGP doesn't predict outcomes.
- Keep: the responsible-gaming line (1-800-GAMBLER), the legal disclaimers ("does not take bets or hold your money"), and Apple's private review notes, which say plainly there's no wagering.
- In-app data labels (Betting Splits, ATS, O/U) describe the data and stay as they are.

## Copy rules for shipped surfaces
- Lead with the grounded-analyst story. Benefit language, second person.
- No category jargon ("prediction markets"), no analogies ("Bloomberg"), no competitor names.
- No em dashes. Short sentences. Minimal commas.
- Any platform or freshness claim must match the table above.

## Known copy debt (owner decision pending)
The landing hero (`src/pages/Index.tsx`) currently names **Kalshi** (no integration) and says **"real time"** (odds are ~6h cadence; only scores are minute-level). Owner directed this copy July 17 and was flagged twice. Recommended fix when ready: swap Kalshi → Caesars, change "one screen, real time" to "one screen, updated all day". The `/why` page deliberately avoids both claims.

## Positioning risks to fix in product (not copy)
1. `PublicBettingPreview` fake percentages contradict differentiator #2 if a user ever notices. Remove or replace (task spawned July 17).
2. NFL advanced stats mix random numbers with real box scores, unlabeled. Same risk class.
3. `gemini-chat` function name invites a false "powered by Gemini" claim in future copy. Rename when convenient.
