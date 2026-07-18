# MGP Positioning Record

**Audit date:** July 17, 2026 (full-codebase competitive audit: frontend features, data layer, chat/insights).
**Purpose:** the on-record list of what MGP can truthfully claim, what it must not claim, and why. Consumer copy (landing hero, `/why` page) must trace to this document. Internal and investor material may use analogy language ("Bloomberg terminal for bettors"); shipped UI copy may not.

---

## Confirmed competitive advantages (ranked by defensibility)

### 1. The grounded analyst: an AI that is architecturally blocked from inventing numbers
**Where:** `supabase/functions/gemini-chat/index.ts` (runs Claude Sonnet 4.6, not Gemini — the name is legacy).
**What's real:** market questions are classified (`MARKET_SPECIFIC` / `CONTEXTUAL` / `FACTUAL`) and market numbers may only come from synced Supabase data injected as `[MGP DATA]`; LLM memory and web search are forbidden for lines. Stat leaderboards and MLB hit streaks are marked AUTHORITATIVE in-prompt so the model cannot contradict the dashboard. Odds older than 6h trigger a staleness disclosure. Guardrails prohibit pick-selling language ("should bet", "lock").
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

## Shipped pitch lines (approved July 17, 2026)
- Landing hero: "Get an edge on the books."
- /why hero: "An analyst that never makes numbers up."
- /why differentiator headers: "No guesses. Just real numbers." · "Every angle comes with receipts." · "Stop checking five apps."

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
