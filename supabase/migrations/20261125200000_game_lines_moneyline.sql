-- Men's college basketball (DECISIONS D-116): NCAA tournament lines that are straight-up records
-- ("1 seeds are 162-2 against 16 seeds since 1985", "Mark Few is 30-12 in the NCAA tournament since 2014", both
-- through the 2026 tournament)
-- point to a side's moneyline, not its spread. game_lines accepted only spread and total.
-- Applied Nov 25, 2026 (with the D-116 merge), so it's ready before the first NCAA tournament game.
alter table public.game_lines drop constraint if exists game_lines_market_check;
alter table public.game_lines add constraint game_lines_market_check check (market in ('spread', 'total', 'moneyline'));
