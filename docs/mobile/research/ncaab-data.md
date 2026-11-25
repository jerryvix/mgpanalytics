# Men's college basketball: free data sources (D-116)

**Researched:** 2026-11-25, with live requests from a cloud session. Every quote below is what the request returned that day.
**Owner rules (Nov 25):** men's only; free sources only, no paid APIs and no sign-ups (a free key is listed as an owner step); ready as soon as possible; transfer portal: confirmed moves only. No scraping of sites whose terms forbid it (247Sports, On3, Sports Reference, KenPom, Bart Torvik).

## Summary

| Need | Best free source | How far back | Status |
|---|---|---|---|
| Results, closing spread and total | ESPN site and core APIs (what the other sports use) | Games back to the mid-1990s; **lines from the 2012-13 season** | Built: `data/history/cbb_espn.csv` |
| NCAA tournament seeds and results | Wikipedia's tournament pages (1985 on) cross-checked game by game against ESPN (seeds from 2002) | 1985 | Built: `data/history/ncaab_tournament.csv` |
| Tournament lines (ATS) | ESPN odds | 2013 tournament | Built (same file) |
| Head coaches | ESPN's per-season coach entries, each checked against the coach's own season record | 2013-14 | Built (coach columns) |
| Coaches' tournament records | ESPN's checked coach | 2014 | Built (engine) |
| Conference tournaments | ESPN tournament id and note on each game | 2012-13 | Built (`tourney` = CONF, `round`) |
| Team form, trends, head-to-head, coach vs opponent | The history file | 2012-13 | Built (engine) |
| NBA draft picks by college | ESPN core draft API | 2005 draft or earlier | Researched, not built |
| NBA draft prospect ranks | ESPN core draft API (ESPN's own board) | Each class, filled in before its draft | Researched; the 2027 class is empty today |
| Recruiting (roster talent) | ESPN's own recruiting rankings (core API) | Classes 2007 to 2029 | Researched, not built. 247Sports composite needs a license |
| Transfer portal, confirmed moves | ESPN athlete stats log (team per season) | Every player with ESPN stats | Researched, not built. "Who entered" has no free confirmed source |
| Efficiency ratings (KenPom, Torvik), Sports Reference | None free and allowed | | Needs a license |

## 1. Results and lines: ESPN

**Requests:** `site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=YYYYMMDD&groups=50&limit=400` (group 50 is Division I) for each day from November 1 to April 15, then `sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/events/{id}/competitions/{id}/odds` for each finished game.

- A Saturday in February: 155 events (`dates=20260207`). An early-November Tuesday: 36 events, 16 of them against a non-Division I team.
- **Division I test:** a non-D1 team has no `conferenceId` on the scoreboard (`20251104`: `('UMBC', '1')` against `('PSUY', None)`, `('ETSU', '24')` against `('CVU', None)`). Lines are fetched only for D1 against D1; the games against non-D1 teams stay in the file so streaks and rest are right.
- **When lines start** (8 games sampled per date, games with a spread in the odds feed):

| Date | Games with a line | Providers seen |
|---|---|---|
| 2003-01-20, 2006-01-20, 2008-01-19, 2010-01-20, 2012-01-18 | 0 of 8 | none |
| 2012-11-20 | 5 of 8 | consensus (spread only), numberfire, teamrankings |
| 2013-01-19, 2013-03-21 | 8 of 8 | numberfire, teamrankings |
| 2013-11-15 to 2016-01-20 | 4 to 8 of 8 | 5Dimes.eu, BETONLINE.ag, BOVADA.lv, Fantasy911.com, **Opening**, PinnacleSports.com |
| 2018-01-20 | 8 of 8 | Caesars, CG Technology, Unibet, Westgate, Wynn |
| 2020 to 2024 | 8 of 8 | DraftKings, Caesars (several states), MGM, ESPN BET |
| 2025-11-20 | 8 of 8 | ESPN BET, ESPN Bet - Live Odds |

  So **spreads and totals exist from the 2012-13 season** (ESPN season 2013).
- **Which providers to trust.** Many games carry several providers, so each one was compared with the median of the others on the same games, 2013 to 2026. The sportsbooks agree within 1.5 points on 98% to 99.9% of games (DraftKings 99.4% of 23,813, Westgate 98.7%, 5Dimes 99.7%, ESPN BET 99.1%), and teamrankings, the main source for 2012-13, on 97.9% of 48,093 (wrong favorite on 0.6%). ESPN's "consensus" agrees on only 89.0% and names the wrong favorite on 1.6% (2013 San Francisco at Stanford: consensus "SF -9.5", teamrankings "STAN -12"; Stanford won by 12). numberfire and accuscore are projection services, and their items include placeholders (`"details": "EVEN", "overUnder": 0.0`; accuscore totals of `-1.0`). "Opening" is the opening line and live odds are in-game. So the history uses sportsbooks first, then teamrankings, and never consensus, numberfire, accuscore, betegy, Fantasy911, opening or live odds; a total of 0 or less counts as no total. Spot check: the 2013 title game, Louisville -4, total 137.5 (teamrankings; Louisville won 82-76).
- **A full odds item** (`401827665`, Feb 7, 2026, DraftKings): `"details": "ARIZ -20.5", "overUnder": 168.5, "spread": -20.5`, with `open`, `close` and `current` blocks for each team (open `+21.5`, close `+20.5`).
- **Speed:** about 0.14 s a request. With 6 workers and a 0.05 s pause each, one season (about 6,300 games, 7,300 requests with coaches) took 4 minutes the first time; the full build of 14 seasons ran at about 22 requests a second. Responses are cached on disk; the fetcher retries timeouts with backoff and unzips gzip bodies ESPN sometimes sends unasked.
- **This season:** upcoming games carry DraftKings lines on the scoreboard a day or two out (`20261125`: 48 D1 games with odds; `20261127`: none posted yet).

**The 2026 season as built:** 6,300 finished games, 5,744 with a line (5,752 D1 against D1), providers DraftKings and ESPN BET. 301 conference tournament games, 67 NCAA tournament games, 31 NIT, 7 College Basketball Crown.

## 2. NCAA tournament seeds: ESPN from 2002, Wikipedia from 1985

**ESPN.** In an NCAA tournament game the scoreboard's `curatedRank` holds the **seed**, not the AP rank:

> `2026-03-20`, event `401856529`: `"type": {"abbreviation": "TRNMNT"}`, `"tournamentId": 22`, note `"NCAA Men's Basketball Championship - West Region - 1st Round"`; Arizona `curatedRank: {current: 1}`, Long Island University `curatedRank: {current: 16}`, Arizona 92-58.

How far back ESPN has seeds:

| Year | What the scoreboard shows |
|---|---|
| 1995 | Tournament games exist (`150762752`, Xavier 63, Georgetown 68, note "First Round") but `curatedRank` is 99 for every team: no seeds |
| 2000 | Same: games, no seeds |
| 2002 | Seeds: `224000012`, tournament 22, note "WEST REGION", Oklahoma 2, UIC 15 |
| 2010 | `"type": "RD64"`, note "MEN'S BASKETBALL CHAMPIONSHIP - SOUTH REGION - 1st ROUND AT JACKSONVILLE FL", Duke 1, Arkansas-Pine Bluff 16 |
| 2013 | Note "... SOUTH REGION - 2nd ROUND AT KANSAS CITY MO" for a 1 against 16 game: 2011 to 2015 called the round of 64 the "2nd Round" |

ESPN's tournament resource lists seasons 2001 to 2026 (`/tournaments/22/seasons`, count 26) and its `bracketology` lists are empty (`/tournaments/22/seasons/2001/bracketology` and `2026`: `"count": 0`). So ESPN covers seeds from 2002. Because the round names changed, `espn_history.py` works out the round from the bracket instead (a team's first game against an equal seed is the First Four; its next games are R64, R32, S16, E8, F4 and the title game). On the 2026 file that gives 4, 32, 16, 8, 4, 2 and 1 games, as it should.

**Before 2002: Wikipedia.** Each tournament has a page ("1985 NCAA Division I men's basketball tournament") whose bracket templates (`16TeamBracket` per region, `4TeamBracket` for the Final Four, `2TeamBracket` for the opening round from 2001 and the First Four from 2011) give every game's seeds, teams and score. Game results are facts, and the text is CC BY-SA, so the CSV credits Wikipedia. The raw wikitext (`index.php?title=...&action=raw`) is one light request per page, fetched one every 4 seconds with a generic client name. (The first request through the API's `action=parse` came back 429, "You are making too many requests to the API", most likely because the egress address is shared; the raw endpoint answered 200.) This environment's network allows `en.wikipedia.org` since Nov 25.

What the pages needed:
- Vacated results are struck through (`{{strikethrough|Memphis State}}` in 1986, Michigan 1992 and 1993, Massachusetts and Texas Tech 1996, Louisville 2012 to 2014, Kansas 2018). The games were played, so they count on the court, as the "1 seeds are 150-2" figure does; the file marks them in `vacated`.
- 2004 to 2010 brackets leave the seeds out; the template then shows its standard order (1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15), which matches the teams on the page (2004: Saint Joseph's against Liberty, Florida against Manhattan), and ESPN confirms every one of those years.
- 1991's three conference play-ins (`seeds=no`) were not part of the bracket and are left out. 2021's VCU-Oregon game was a no-contest, so 2021 has 66 games.
- Only some pages have a coach column in the Teams table (1985 to 1988, 1990, 2013), and 2013's misses 12 games' coaches, so tournament coach records use ESPN's checked coaches, from 2014. A coach's record only counts seasons in his unbroken run in the data, and only when every tournament game his team played in that run carries his name; otherwise the engine says nothing about him. Going back to 1985 would need each team-season's coach (Wikipedia's team season pages, about 2,700 of them, or a licensed source).

Other legitimate sources for the pre-2002 seeds: the NCAA's own Men's Final Four Records Book (ncaa.org, PDF, every bracket since 1939; not reachable from this environment) and NCAA.com's bracket archive. Kaggle's March Machine Learning Mania data has seeds since 1985 but needs an account and is licensed for the competition. Sports Reference has them too; its terms rule it out.

**Cross-check:** for 2002 on, every ESPN tournament game must match a Wikipedia game with the same round, the same two seeds and the same two scores, or the build stops. Result: all 1,572 ESPN games from 2002 to 2026 match (2 by round and score because ESPN left the seeds off the 2008 and 2018 First Four games); 8 Wikipedia games aren't marked as tournament games at ESPN (the 2002 to 2007 opening-round games, which ESPN lists with no tournament id or seeds, and two 2017 First Four games ESPN doesn't return), so they come from Wikipedia alone. They are all games between equal seeds, which never count in a seed matchup. The file also reproduces the well-known records: 1 seeds 150-2 against 16 seeds through 2023 (UMBC 2018, Fairleigh Dickinson 2023), 2 seeds 153-11 against 15 seeds through 2026 (the eleven 15-over-2 upsets), and every champion checked (1985 Villanova to 2026 Michigan).

**Lines for tournament games** come from ESPN from the 2013 tournament. Lines for 1985 to 2012 would need a licensed odds history (for example SportsDataIO, Sportradar, or Sports Insights' Bet Labs); none is free. Sportsbook Reviews Online used to post free historical odds spreadsheets from 2007-08; their terms weren't checked, so they aren't used.

## 3. Head coaches: ESPN, checked

**Requests:** `.../seasons/{season}/teams/{team}/coaches` lists a team's coach for a season; each item is the coach's season entry (`.../seasons/{season}/coaches/{id}`), whose `records` link to his record with that team (`.../seasons/{season}/types/2/coaches/{id}/record`, `"summary": "23-10-0"`).

The team lists are right most years (Duke 2022 Mike Krzyzewski, 2023 Jon Scheyer; Louisville 2018 David Padgett, 2019 Chris Mack; UConn 2019 Dan Hurley) but wrong in places:
- **2024:** Kentucky and Arkansas list "Eddie Sutton" (who died in 2020), Indiana "Bobby Knight", Auburn "Cliff Ellis", North Carolina "Matt Doherty", Michigan "Bill Frieder". Eddie Sutton's 2024 record: `"summary": "0-0-0"`.
- **2025:** Indiana lists Darian DeVries (record `0-0-0`; he started in 2025-26) and Villanova lists Kevin Willard (his 2025 season entry points to Maryland, team 120, `27-9-0`).
- **Before 2014:** team lists are empty for 2013 (`[]` for Duke, Kentucky, Arkansas, Purdue), and the season-wide lists for 2012 and 2013 are today's coaches with no team at all.

So a coach counts for a team and season only when his own season entry has a record **with games** for that team. A team left with nobody tries the coach it had the season before and the season after under the same check (Arkansas 2024: Eric Musselman, `16-17-0`). The 2026 season: 11,792 of 12,052 D1 team-games have a coach (98%); Kentucky Mark Pope, Indiana Darian DeVries, Villanova Kevin Willard, Michigan Dusty May, Arkansas John Calipari. The coach's ESPN id is stored too, so two coaches with one name can't merge.

## 4. NBA draft: ESPN core API

- `sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/draft`: "2026 NBA Draft", 2 rounds, `athletes` (count 102), `rounds` with every pick (`"status": "SELECTION_MADE", "pick": 1, "overall": 1`, the NBA team and the athlete).
- A draft athlete: Darryn Peterson, `"college"` and `"team"` refs (Kansas, 2305), `"attributes": [{"abbreviation": "POS RK", "value": 1}, {"abbreviation": "OVR RK", "value": 1}]` (ESPN's own board), and ESPN analysts' write-ups (ESPN's copyrighted text: use the ranks and picks, never the text).
- Past drafts: 2005 (84 athletes), 2010 (128), 2015 (118), 2020 (101), 2023 (125), 2025 (104), each `"COMPLETED"`.
- **The 2027 class is empty today** (`.../seasons/2027/draft/athletes`: `"count": 0`; status `"SCHEDULED"`). The 2026 board was filled by late December 2025 (its logo entries are stamped `2025-12-23`), so ESPN's 2027 board should appear in a month or so.
- What it can say, checkably (patterns, no data pulled yet): "{School} has had N first-round picks since 2015" (picks by college), "ESPN ranks him No. N in the 2027 class" (with ESPN named as the source).

## 5. Recruiting and roster talent

- **247Sports composite and blue chips:** 247Sports' terms forbid scraping and there is no public API. **Needs a license** (CBS Interactive / 247Sports data licensing). On3's Industry Ranking is the same.
- **Free and allowed: ESPN's own recruiting rankings** in the core API. `.../mens-college-basketball/recruiting` lists classes 2007 to 2029; `/recruiting/2026/athletes` has 438 recruits, 2027 has 405, 2014 has 1,364. A recruit: `"grade": 95`, `rank`, `positionRank`, `stateRank`, `regionRank`, `"status": {"description": "Signed"}` (or "Verbal", "Undecided"), and `schools` with each school's status and ESPN team id (2026's No. 1, Tyran Stokes: Signed, Kansas). There is no star field; use ESPN's rank (pattern: "N ESPN Top-25 recruits on the roster"), not stars. `/recruiting/2026/rankings` names "ESPN Class Rankings".
- Matching a recruit to a college roster needs name and school (the recruit's id is a recruiting id, not the player id).

## 6. Transfer portal: confirmed moves only

- The NCAA's portal itself is not public (only school compliance staff see it). Who **entered** the portal is reported by the media (On3, 247Sports, ESPN articles); there is no free source that confirms an entry, so MGP can't show entries.
- **Confirmed moves from ESPN:** an athlete's stats log names his team each season. `.../athletes/5060705/statisticslog`: Zoom Diallo, season 2025 team 264 (Washington), 2026 team 264, 2027 team 96 (Kentucky). He played for Washington and is playing for Kentucky: a completed move, from game data. (`.../seasons/{s}/athletes/{id}` is no help: it returns today's team for every season.)
- Method: each D1 roster (`site.api.espn.com/.../teams/{id}/roster`, 14 on Kentucky's today) and each player's stats log, about 5,000 requests a refresh. A move shows once the player is on the new roster with ESPN stats, so spring commitments appear in the fall.
- Schools' own athletics sites announce signings, which are official, but that is hundreds of sites to read; not planned.

## 7. Conference tournaments and other postseason events

ESPN marks each game: season type 2 with a tournament id and a note for conference tournaments (`"Big Ten Tournament - 1st Round"` id 9, `"SEC Tournament - Quarterfinal"` id 27, `"Phillips 66 Big 12 Tournament"` id 5, `"T. Rowe Price ACC Tournament"` id 3), season type 3 for the NIT (id 21, `"NIT - 1st Round"`), the College Basketball Crown (id 161) and the NCAA tournament (id 22). Early-season events carry notes too (`"Marriott Bonvoy Battle 4 Atlantis"`, `"Players Era Festival"`). The history file's `tourney` column is CONF when both teams share a conference in February or March and the note names a tournament or championship; `round` is R1, R2, R3, QF, SF or F from the note.

## 8. Needs a license or an API key

| Source | What it has | Access |
|---|---|---|
| 247Sports | Composite recruiting ranks, blue chips, portal tracker | Terms forbid scraping; no public API. License via 247Sports (CBS) |
| On3 | Industry Ranking, portal tracker, NIL values | Terms forbid scraping; no public API. License |
| Sports Reference (College Basketball Reference) | Historical schedules and results, seeds, coaches, box scores | Terms bar bots and use in other products. Data licensing through Sports Reference |
| KenPom | Adjusted efficiency, tempo, ratings since 2002 | Paid subscription; terms forbid redistribution. A data license from the owner of the site |
| Bart Torvik (barttorvik.com) | T-Rank ratings, player metrics | Free to read on the site; the owner's rule is no scraping. Needs the site owner's permission |
| CollegeBasketballData.com | Games, lines from several books, team and player stats, ratings (from the CollegeFootballData team) | **Free API key by email sign-up.** Owner step if wanted: it would add lines from more books and adjusted ratings. Coverage wasn't tested here (no key) |
| Licensed odds history (SportsDataIO, Sportradar, Bet Labs) | Closing lines before 2012-13 | Paid |

## 9. What was built and what it covers

**`data/history/cbb_espn.csv`** (14.6 MB): every finished Division I game from 2012-13 to 2025-26, 82,527 games (76,136 between two D1 teams), 66,875 with a closing spread and 64,928 with a total. Columns: the other leagues' columns plus `home_coach_id`, `away_coach_id`, `home_conf`, `away_conf`, `home_seed`, `away_seed`, `tourney`, `round`.

| Season | Games | D1 v D1 | With a line | Coach known |
|---|---|---|---|---|
| 2012-13 | 5,730 | 5,381 | 3,744 (70%) | none (ESPN has no coach lists) |
| 2013-14 | 5,948 | 5,503 | 3,895 (71%) | 96% |
| 2014-15 to 2017-18 | 5,932 to 6,002 | about 5,500 | 73% to 74% | 99% |
| 2018-19 to 2022-23 | 4,162 (2020-21) to 6,222 | 3,828 to 5,715 | 99% to 100% | 99% |
| 2023-24 | 6,243 | 5,726 | 100% | 96% |
| 2024-25 | 6,292 | 5,764 | 100% | 93% |
| 2025-26 | 6,300 | 5,752 | 100% | 98% |

The current season is rebuilt in the daily job and not committed. Going further back would add games without lines (ESPN has none before 2012-13); more lines before 2018-19 would need a licensed odds history; the file stays under 20 MB through about 2030 at 1.1 MB a season.

**`data/history/ncaab_tournament.csv`** (0.26 MB): all 2,652 NCAA tournament games from 1985 to 2026 (41 tournaments; none in 2020): season, round, region, date (ESPN games), seeds, teams, score, overtime, both coaches (Wikipedia 2013, ESPN's checked coach from 2014), the line and total from 2013 (867 of 870 games), ESPN ids, `vacated` and `source`. `ncaa_tournament.py seeds 5 12` prints "5 seeds are 106-58 against 12 seeds since 1985" and "5 seeds are 22-28-2 ATS against 12 seeds since 2013"; `--self-test` checks the parser, the record math and the committed file (game counts per year, seeds adding to 17 in the first round, champions, the 16-over-1 upsets, 150-2 through 2023).
