# Proposal: Check MGP Before You Bet

**Date:** 2026-11-21 · **Status:** aligned 2026-11-21 with changes: Signal kept (D-035), almost no footnotes (D-036), arrows instead of a Start Here box (D-037), everything with data by end of week (D-038) · **Inputs:** owner direction (Nov 21), data audit (below), simulated concept test (`../research/2026-11-21-game-page-concepts.md`)

## The problem, in the owner's words

People have a game in mind ("Michigan State and Oregon tonight") but don't know what to look at first. Sportsbooks show lines and expect you to bring an opinion. Everything else is scattered: podcasts, YouTube, X accounts, stats sites. Most bettors check two or more places before a bet; four in ten check four or more (simulated survey).

## The idea

**Pick a game. MGP shows you what to look at first, then everything else, in one place.**

The game becomes MGP's unit, the way a stock is on Stocks.News: tap it and every piece of data you'd want for a decision is a scroll away. The habit we're building: *a game is on, I don't know what to bet, let me check MGP first.*

## What changes

### 1. The game page becomes the center of MGP (app and website)

**Header:** teams (with rank badges), start time, TV, venue; the current spread, total and moneyline in large type; the move since open; "Odds as of 4:10 PM · DraftKings"; bell (alerts for this game), star (follow), share.

**Start Here** (directly under the header): the 3 to 5 most notable facts about this game.

**Section bar** (jumps down one long page), ordered by what bettors say they check first:

| # | Section | What's in it |
|---|---|---|
| 1 | Injuries | Who's out or questionable, starters first |
| 2 | Form | Last 10, current streak, home and away records |
| 3 | Matchup | Side-by-side bars: record, points for and against, rank |
| 4 | Odds and Line Movement | Every book we have, open versus now, a movement chart |
| 5 | Public Betting | % of bets versus % of money (NFL and college football, DraftKings) |
| 6 | Props | Player lines (where the feed is alive) |
| 7 | History | Head-to-head, covers the spread, over/under, in plain English |
| 8 | Conditions | Weather, venue, days of rest |
| 9 | Insiders | Betting voices who cover these teams |
| 10 | The Analyst | "Ask about this game", answers grounded in this game's data |

A section with no data for a sport is hidden, never empty and never "coming soon". The page ends with the information-and-entertainment disclaimer and 1-800-GAMBLER.

### 2. Start Here: the "what should I look at first?" layer

Rules, not AI, pick the facts, so it can't invent anything and costs nothing to run:

- Each fact type has a "how unusual is this" score: a 4-game win streak, covering the spread 8 of the last 10, a 2-point line move, a starter ruled out, the second night of a back-to-back, a 3-game head-to-head run, overs in 5 straight.
- The top 3 to 5 facts across both teams show, in plain English with the sample size: "Michigan State has covered the spread in 5 of its last 10." Never "ATS 5-5".
- Each fact taps through to its section, and shows where it came from and when.
- Facts are neutral statements about both teams. Nothing says what to bet.

*Illustrative example (made-up numbers):* "Oregon has won 4 straight." · "The spread moved 2 points toward Oregon since it opened." · "Michigan State has covered the spread in 5 of its last 10." · "Oregon's leading scorer is listed questionable."

The Start Here engine lives in `packages/shared/` so the app and the website use the same one, with unit tests for every fact rule.

### 3. MGP Score: recommendation

**Don't ship a score that says which side the data favors.** The simulated test:

- It drew people who want a pick ("if it says Oregon 78, I'm tailing the 78") and pushed away the people who'd trust MGP: net trust went down (31% less, 28% more).
- 71 of 250 industry respondents flagged it as a compliance, App Store or responsible-gaming risk, more than the other three concepts combined.
- It would be judged on wins and losses, which turns MGP into a tout service, the opposite of the positioning.

**Start Here won instead:** first in every panel for "would open before a bet" and for usefulness, with almost no risk flags.

**Optional alternative: Game Heat.** A score for how much is happening in a game (size of the line move, number of notable facts, injury news), used to rank tonight's games on Today. It helps you pick *which game to look at*, never which side. Untested; could be tested the same way.

### 4. Everything leads to a game

- **Today:** "Tonight in Your Sports", a list of games in the sports you bet on. Each row shows the line, the move since open, and one Start Here fact as a teaser ("Oregon has won 4 straight"). That teaser is the reason to tap.
- **Search:** type a team and land on its next game.
- **Alerts:** every alert opens its game page.
- **Players:** reached from a game (injuries, props, matchup), not a separate destination.
- **The Analyst:** opens with the game's context already loaded when started from a game page.

### 5. Messaging: everything says "data to make your decision"

| Role | Line |
|---|---|
| Brand | Bet Smarter, Not Harder |
| Promise | Everything about the game. One place. |
| Habit | Check MGP before you bet. |

**Voice:** a guide, not a tout. "Start Here", "What to Know", "Look at This First". Never "bet", "lock", "play", "hammer".

| Surface | Example copy |
|---|---|
| Welcome | Pick a game. We'll show you what matters first. |
| Today header | Tonight in Your Sports |
| Start Here header | What to Know Before You Bet |
| Push alert | Michigan State vs Oregon, 7:30 PM. Start Here: Oregon has won 4 straight. |
| Empty section | We don't have injury reports for this league yet. |
| The Analyst | Ask anything about this game. Answers come from MGP's data, with the time it was pulled. |

**App Store screenshot story:** (1) Bet Smarter, Not Harder (2) Everything About the Game, One Place (3) Start Here: What to Know First (4) See Where the Lines Are Moving (5) Ask The Analyst.

### 6. Website relayer

The website gets the same game page at `/game/:sport/:id`. Slate rows, Today's Board rows and search results link to it. The existing `GameInsightsSheet` (MLB and college football) and the NBA `GamePreviewModal` fold into it. Because the logic is shared, the website version is mostly layout work after the app's game page exists.

## Data: what we have and what's missing (audit, Nov 21)

| Section | NFL | NBA | NCAAB | NCAAF | MLB |
|---|---|---|---|---|---|
| Odds by book | DraftKings only | 4 books | 4 books | DraftKings only | DraftKings only |
| Line movement (open to now) | Yes | Needs an ID fix | Needs an ID fix | Yes | Yes |
| Form and streaks | Computable | Yes (no streaks) | Computable (finals unreliable) | Computable | Computable |
| Covers the spread / over-under | Computable since Sep 24 | Weak | Weak | Computable since Sep 24 | Computable |
| Head-to-head | Computable | This season | Computable | 5 seasons | Computable |
| Injuries | Missing (free fix) | Yes | Stored, not scheduled | Missing (free fix) | Missing (free fix) |
| Public betting (bets vs money) | Yes, real | No | No | Yes, real | No |
| Props | Feed likely dead | Feed likely dead | No | No | No |
| TV, weather, rest | In feeds we already pull / computable | Same | Same | Same | Weather stored, not shown |
| Team stats beyond scores | No source | No source | No source | No source | No source |

### Free fixes (code only, no new cost)

- Compute streaks, form, covers-the-spread and over/under from stored scores and pre-game lines (football and MLB this season; label "since Sep 24").
- Add injuries for NFL, college football and MLB from the same free ESPN source NBA already uses.
- Fix the line-movement ID mismatch (NBA, NCAAB, and the website's Home "line move", which is probably always empty today) and draw the movement chart.
- Keep college basketball final scores (the sync has no lookback, so late finals are missed).
- Parse TV and weather from ESPN data we already fetch; compute days of rest.
- Let The Analyst take a game ID and read that game's data, including line history.

### Needs an owner cost decision (D-022)

- **Single-book football and MLB odds, and props.** The Odds API key stopped working in July 2026, and the owner switched game odds to ESPN's free DraftKings feed on Aug 7, 2026. So NFL, college football and MLB show DraftKings only. NBA and college basketball still have 4 books (BallDontLie). The props feed still uses the dead key, so it's probably not updating. Options: launch with what we have and name the book on screen ($0), or price a feed to restore multiple books and props.

### Problems found that should be fixed regardless

- **Random numbers still on the website:** the NFL player page's Advanced tab shows `Math.random()` stats (`src/utils/advancedStatsCalculator.ts` via `NFLAdvancedStats.tsx`). This breaks the no-mock-data rule.
- **A verdict on the website:** the college football matchup section has a composite "lean / edge: Team" tile (`MatchupIntelSection`), which conflicts with no picks (D-016).
- **Curated angles have expired:** every `trendingBets.ts` entry is past its date, so "Verified Angles" shows nothing.
- **Sample capper rows** with made-up follower counts were seeded in a migration; check whether they're still in production.
- **Docs that are now wrong:**
  - `positioning.md` says public betting % is fake (it's real for NFL and college football) and says "4 books" (football and MLB are DraftKings only).
  - D-026 says MGP has no money-flow data (it has % of money for NFL and college football).
  - D-024 says to check Odds API quota (the key is dead).

## Scope and timeline

The game page was already in v1. Start Here plus the free data fixes add about a week. To keep a mid-December submission:

- **v1 game page:** header, Start Here, Injuries, Form, Odds and Line Movement, Public Betting (NFL, college football), History (where computable), The Analyst for this game.
- **v1.1:** Props (pending a feed), Conditions, Insiders on the game page, Game Heat (if wanted), the website relayer.

Apple's verification of the LLC is still the critical path.

## Mockups

https://claude.ai/artifact/7ZWWFemMUESwBoLiFsEk3i (private; owner shares it). Six phone screens with example data: game page top (What to Know arrows), game page sections (Form highlighted after tapping its arrow; one DraftKings line; Signal; About This Data link), game page in dark mode, welcome, What Do You Bet On, Today with the first-launch arrow.

## Next after alignment (original plan)

Mockups in Manrope, light and dark:

1. Today in Your Sports, with fact teasers.
2. Game page top: header and Start Here.
3. Game page sections, scrolled.
4. Onboarding: "What do you bet on?"
