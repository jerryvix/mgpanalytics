# Nugget Grading — the 99% release gate

Every "Did You Know" nugget (Trending Bets seeds in `src/data/trendingBets.ts`, Edge pool in
`src/data/edges.ts`) must pass BOTH gates before it ships with `verified: true`:

## Gate 1 — automated structural integrity (runs on every build)

`src/test/nuggetIntegrity.test.ts` fails the test suite if any entry:
- lacks a non-empty `nugget`, `source`, `line`, or `book`
- has a duplicate `id`
- uses full-year ranges instead of the compact `('YY-'YY)` style
- contains hedge/hallucination tells ("probably", "reportedly", "some say", "believed to")
- is `verified: true` with a placeholder source ("TBD", "unknown", "n/a")

## Gate 2 — factual grading (recurring scheduled review)

A scheduled weekly review re-grades every released nugget on this rubric (100 points):

| Criterion | Points | Fails if |
|---|---|---|
| Every named fact web-verifiable | 40 | any stat, year, name, or count can't be confirmed by a source |
| No misleading implication | 30 | wording implies something false (e.g. a player "repeating" an award he never won) |
| Odds/lines current | 15 | line moved materially since `updated` date |
| Insightful, not filler | 15 | a casual fan learns nothing |

**Release rule: score must be ≥ 99. Anything below is set `verified: false` immediately**
(which auto-hides it from users — the UI filters on `verified`) and is only re-released
after the wording is fixed and re-graded.

Known catches to date (regression list — re-check these patterns every review):
- Heisman repeat-winner history attached to a first-time candidate (implied he'd won before)
- "rookie Drake Maye" in the '25 season (drafted '24 — second-year)
- "six franchises never won a World Series" (it's five)

## Review cadence — point of generation, every time

There is NO fixed review schedule (a weekly cron was tried and dropped by owner decision,
Jul 2026). Instead:

1. **Every generation is a verification.** Whenever a nugget or edge is created OR edited —
   in any session, human or automated — every named fact and odds line in it must be
   web-verified in that same session before `verified: true` is set. No exceptions.
2. **Every build re-runs Gate 1** (`nuggetIntegrity.test.ts`), so nothing structurally
   unsound ships even if it slipped into the file.
3. **Freshness is visible to users**: every Trending Bets card displays its `updated`
   capture date, and cards older than 7 days render a "line may have moved" tag. Odds are
   re-captured whenever a session touches the file, and any session that notices a stale
   or wrong entry fixes or hides it on the spot rather than waiting for a review pass.
