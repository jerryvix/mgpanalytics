# Public betting data checks, Nov 23 2026

Supporting `docs/mobile/proposals/2026-11-23-pulse.md`.

- `draftkings-splits-2026-11-23.json`: DraftKings' bets and money for NFL, NBA and college basketball as read by the fixed parser (`supabase/functions/sync-betting-splits/parse.ts`) from the Nov 23 pages saved in `src/test/fixtures/`.
- `trends_proto.py`: prototype of the trend engine. Reads nflverse's `games.csv` (clone `https://github.com/nflverse/nfldata`, file `data/games.csv`) and prints team, QB and league trends for Week 12. Run: `python3 trends_proto.py` after setting the path at the top.

Findings used in the proposal:
- Josh Allen as a 10+ point favorite since 2023: 11-0 SU, 3-8 ATS (10-0 and 2-8 before Week 11), matching the analyst's post.
- NFL favorites since Week 8: 35-20 ATS on nflverse closing lines.
- MGP's stored DraftKings splits, NFL Weeks 3 to 9 (103 games): side with the most money 42-54-5 ATS (ties excluded; first written as 42-56-5); sides with 70%+ of the money 17-29-3; money 20+ points ahead of bets 5-12; Week 8 alone 9-5. College football, Sep 24 to Nov 2 (397 games): most money 196-187-6; 70%+ of the money 118-116-3; money 20+ points ahead of bets 51-60-3.
- This week: Cowboys 5-11 ATS on Thanksgiving since 2010 and 6-15 ATS as a favorite since 2024; Patrick Mahomes 13-5-1 ATS as an underdog; Broncos and Bills 8-2 ATS this season; Eagles 2-8.
- `cfb_leaders.py` and `cfb-leaders-since-week4.json`: college football ATS and over/under leaders from MGP's stored closing lines (`betting_lines`) and finals (`ncaaf_games`), Sep 24 onward (562 games). The top of the list matches the owner's Nov 23 screenshot (Georgia Southern, Louisiana Tech, Wake Forest, Liberty, Air Force, Utah, Iowa, Nebraska, Kennesaw State) with shorter records because Weeks 0 to 3 are missing.
