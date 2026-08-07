// Fantasy draft-season board: the current-year ADP draft board (default)
// with a toggle to last season's results graded against preseason ADP.
// ADP comes from nfl_adp_snapshots (Fantasy Football Calculator, 12-team
// PPR), finishes from the nflverse-backed rank views; both share gsis_id
// so joins are exact. Rows link to the player detail page (Fantasy tab)
// when the name matches a known player.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { supabase } from "@/integrations/supabase/client";
import { isTopTenFinish, normalizePlayerName } from "@/utils/fantasyTrends";

const POS_GROUPS = ["QB", "RB", "WR", "TE"] as const;
type PosGroup = (typeof POS_GROUPS)[number];
type BoardView = "draft" | "results";

const ADP_SOURCE = "ffc_ppr_12";
const ROWS_SHOWN = 15;

interface FinishRow {
  gsis_id: string | null;
  player_name: string | null;
  team: string | null;
  total_ppr: number | null;
  ppg_ppr: number | null;
  games: number | null;
  position_rank: number | null;
}

interface AdpRow {
  gsis_id: string | null;
  player_name: string;
  team: string | null;
  adp: number;
}

interface BoardRow {
  rankLabel: string; // "WR3" (ADP order on draft view, ADP order on results view)
  name: string;
  team: string | null;
  adp: number | null; // overall ADP pick average, e.g. 2.9
  finishRank: number | null;
  totalPpr: number | null;
  ppgPpr: number | null;
  games: number | null;
  deltaPts: number | null; // results view: actual pts minus pts of the actual finisher at the ADP slot
  playerId: string | null; // players.id for linking
}

interface BoardData {
  view: BoardView;
  adpSeason: number;
  finishSeason: number;
  rows: BoardRow[];
}

async function loadBoard(posGroup: PosGroup, view: BoardView): Promise<BoardData | null> {
  const { data: latest } = await supabase
    .from("nfl_fantasy_season_ranks")
    .select("season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest?.season) return null;
  const finishSeason = latest.season;
  const adpSeason = view === "draft" ? finishSeason + 1 : finishSeason;

  const [{ data: adp }, { data: finishes }, { data: players }] = await Promise.all([
    supabase
      .from("nfl_adp_snapshots")
      .select("gsis_id, player_name, team, adp")
      .eq("season", adpSeason)
      .eq("source", ADP_SOURCE)
      .eq("position", posGroup)
      .order("adp", { ascending: true }),
    supabase
      .from("nfl_fantasy_season_ranks")
      .select("gsis_id, player_name, team, total_ppr, ppg_ppr, games, position_rank")
      .eq("season", finishSeason)
      .eq("pos_group", posGroup)
      .order("position_rank", { ascending: true }),
    supabase.from("players").select("id, name").eq("sport", "NFL"),
  ]);

  const idByName = new Map<string, string>();
  for (const p of players || []) idByName.set(normalizePlayerName(p.name), p.id);

  const finishList = (finishes || []) as FinishRow[];
  const finishByGsis = new Map<string, FinishRow>();
  const ptsByFinishRank = new Map<number, number>();
  for (const f of finishList) {
    if (f.gsis_id) finishByGsis.set(f.gsis_id, f);
    if (f.position_rank != null && f.total_ppr != null && !ptsByFinishRank.has(f.position_rank)) {
      ptsByFinishRank.set(f.position_rank, f.total_ppr);
    }
  }

  const adpList = (adp || []) as AdpRow[];
  const rows: BoardRow[] = adpList.slice(0, ROWS_SHOWN).map((a, i) => {
    const finish = a.gsis_id ? finishByGsis.get(a.gsis_id) : undefined;
    const adpPosRank = i + 1;
    // Expectation for a draft slot = what the actual finisher at that slot
    // scored. Positive delta: the player outscored their draft slot.
    let deltaPts: number | null = null;
    if (view === "results") {
      const expected = ptsByFinishRank.get(adpPosRank);
      if (expected != null) {
        deltaPts = Math.round(((finish?.total_ppr ?? 0) - expected) * 10) / 10;
      }
    }
    return {
      rankLabel: `${posGroup}${adpPosRank}`,
      name: a.player_name,
      team: finish?.team ?? a.team,
      adp: a.adp,
      finishRank: finish?.position_rank ?? null,
      totalPpr: finish?.total_ppr ?? null,
      ppgPpr: finish?.ppg_ppr ?? null,
      games: finish?.games ?? null,
      deltaPts,
      playerId: idByName.get(normalizePlayerName(a.player_name)) ?? null,
    };
  });

  return { view, adpSeason, finishSeason, rows };
}

const fmtPts = (v: number | null) => (v == null ? "-" : v.toFixed(1));
const fmtDelta = (v: number | null) => (v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);

// ADP is stored as the average overall pick (Gibbs 1.6 = usually #1-2 off the
// board). Display it in draft notation instead: 1.6 -> "1.02" (round 1, pick
// 2 of a 12-team draft), matching how Sleeper/ESPN drafters read the board.
const fmtRoundPick = (adp: number | null, teams = 12) => {
  if (adp == null) return "-";
  let round = Math.floor((adp - 1) / teams) + 1;
  // FFC formats from an unpublished higher-precision average, so exact .5
  // boundaries can land one slot off their site. Standard rounding is the
  // closest recoverable convention; validated within one pick across all
  // 256 players of the 2026 board.
  let pick = Math.round(adp - (round - 1) * teams);
  if (pick > teams) {
    round += 1;
    pick = 1;
  }
  return `${round}.${String(pick).padStart(2, "0")}`;
};

export function FantasyLeadersBoard() {
  const [posGroup, setPosGroup] = useState<PosGroup>("RB");
  const [view, setView] = useState<BoardView>("draft");
  const { data, isLoading } = useQuery({
    queryKey: ["nfl-fantasy-board", view, posGroup],
    queryFn: () => loadBoard(posGroup, view),
    staleTime: 60 * 60 * 1000,
  });

  const finishLabel = (r: BoardRow) =>
    r.finishRank == null ? "-" : `${posGroup}${r.finishRank}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {([
            ["draft", "2026 Draft Board"],
            ["results", "2025 vs ADP"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`font-mono text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border transition-colors ${
                view === v
                  ? "text-terminal-green border-terminal-green/50 bg-terminal-green/10"
                  : "text-muted-foreground border-border bg-card/50 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {POS_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setPosGroup(g)}
              className={`px-3 py-1 rounded text-xs font-mono font-bold border transition-colors ${
                g === posGroup
                  ? "bg-terminal-green/20 text-terminal-green border-terminal-green/40"
                  : "bg-muted/30 text-muted-foreground border-border hover:border-terminal-green/40"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground font-mono">
        {view === "draft"
          ? `Where drafts are taking ${posGroup}s right now, with last season's production - click a player for their trajectory.`
          : `The ${data?.finishSeason ?? "last"} draft board, graded: +/- compares each player's points to the actual ${posGroup}-finisher at their draft slot.`}
      </p>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !data || data.rows.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground font-mono">
              {view === "draft"
                ? "No ADP synced yet for the upcoming season."
                : "No ADP data for last season."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Trophy className="w-4 h-4 text-terminal-green" />
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                  {view === "draft"
                    ? `${data.adpSeason} ${posGroup} Draft Board (ADP)`
                    : `${data.finishSeason} ${posGroup} Finishes vs ADP`}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left font-medium pl-4 pr-1 py-2 w-14">#</th>
                      <th className="text-left font-medium px-1 py-2">Player</th>
                      <th className="text-left font-medium px-1 py-2">Team</th>
                      <th className="text-right font-medium px-2 py-2">ADP</th>
                      <th className="text-right font-medium px-2 py-2">
                        {view === "draft" ? `'${String(data.finishSeason).slice(2)} Finish` : "Finish"}
                      </th>
                      <th className="text-right font-medium px-2 py-2">PPR Pts</th>
                      {view === "draft" ? (
                        <th className="text-right font-medium pr-4 py-2">PPG</th>
                      ) : (
                        <th className="text-right font-medium pr-4 py-2">+/- Pts</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={`${r.rankLabel}-${r.name}`} className={`border-b border-border/40 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                        <td className="pl-4 pr-1 py-2 font-mono font-bold text-muted-foreground">{r.rankLabel}</td>
                        <td className="px-1 py-2">
                          {r.playerId ? (
                            <Link
                              to={`/dashboard/nfl/players/${r.playerId}`}
                              className="font-medium text-foreground hover:text-terminal-green transition-colors"
                            >
                              {r.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-foreground">{r.name}</span>
                          )}
                        </td>
                        <td className="px-1 py-2">
                          {r.team && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono">
                              <TeamLogo sport="NFL" name={r.team} abbr={r.team} size={14} /> {r.team}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {fmtRoundPick(r.adp)}
                        </td>
                        <td className={`px-2 py-2 text-right font-mono tabular-nums font-bold ${isTopTenFinish(r.finishRank) ? "text-terminal-green" : "text-foreground"}`}>
                          {finishLabel(r)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-bold tabular-nums">{fmtPts(r.totalPpr)}</td>
                        {view === "draft" ? (
                          <td className="pr-4 py-2 text-right font-mono tabular-nums">{fmtPts(r.ppgPpr)}</td>
                        ) : (
                          <td
                            className={`pr-4 py-2 text-right font-mono font-bold tabular-nums ${
                              r.deltaPts == null
                                ? "text-muted-foreground"
                                : r.deltaPts >= 0
                                  ? "text-terminal-green"
                                  : "text-terminal-red"
                            }`}
                          >
                            {fmtDelta(r.deltaPts)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground px-4 py-2">
                ADP: real 12-team PPR drafts from the past week (Fantasy Football Calculator), shown as
                round.pick - 1.02 means round 1, pick 2. Rookies without NFL history show blank last-season columns.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
