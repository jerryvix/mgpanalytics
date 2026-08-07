// Name -> gsis_id resolution for backtest ingests (ADP, season props). Pure
// module so vitest can cover it (src/test/resolvePlayer.test.ts); the sync
// functions feed it crosswalk rows loaded from nfl_player_ids.
//
// Ladder (first hit wins):
//   1. manual override (nfl_name_overrides row for this source)
//   2. unique normalized-name + position match
//   3. normalized-name + position narrowed by team
// Anything still ambiguous or unknown resolves to null — the raw name is
// always stored, and misses surface in sync_log.details.unmatched plus the
// nfl_backtest_unmatched view. Never guess: a wrong join silently corrupts
// every accuracy number downstream.

/** Same algorithm as normalizePlayerName in src/utils/fantasyTrends.ts —
 * keep in lockstep (asserted by src/test/resolvePlayer.test.ts). */
export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'’-]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CrosswalkRow {
  gsis_id: string;
  name_normalized: string;
  position: string | null;
  latest_team: string | null;
}

export interface PlayerResolver {
  /** position/team are hints, not hard filters — pass what the source has.
   * position accepts a single abbreviation or a set (e.g. the offensive
   * positions a prop market implies: pass_yards -> ["QB"]). */
  resolve(name: string, position?: string | string[] | null, team?: string | null): string | null;
}

/**
 * Build a resolver over the full crosswalk. `overrides` maps raw source_name
 * (as the source spells it) -> gsis_id for this ingest's source.
 */
export function buildPlayerResolver(
  rows: CrosswalkRow[],
  overrides: Record<string, string> = {}
): PlayerResolver {
  const byName = new Map<string, CrosswalkRow[]>();
  for (const row of rows) {
    const list = byName.get(row.name_normalized);
    if (list) list.push(row);
    else byName.set(row.name_normalized, [row]);
  }

  return {
    resolve(name, position, team) {
      const override = overrides[name] ?? overrides[normalizePlayerName(name)];
      if (override) return override;

      const candidates = byName.get(normalizePlayerName(name));
      if (!candidates || candidates.length === 0) return null;

      // Position filter (when the source provides one). Compare uppercased
      // abbreviations; crosswalk positions are nflverse abbreviations.
      const posSet = position
        ? new Set(
            (Array.isArray(position) ? position : [position])
              .map((p) => p.trim().toUpperCase())
              .filter(Boolean)
          )
        : null;
      let pool = posSet && posSet.size > 0
        ? candidates.filter((c) => posSet.has((c.position ?? "").toUpperCase()))
        : candidates;
      if (pool.length === 0) pool = candidates; // bad position hint — fall back

      if (pool.length === 1) return pool[0].gsis_id;

      // Tiebreak by team abbreviation when available.
      const teamAbbr = team?.trim().toUpperCase() || null;
      if (teamAbbr) {
        const byTeam = pool.filter((c) => (c.latest_team ?? "").toUpperCase() === teamAbbr);
        if (byTeam.length === 1) return byTeam[0].gsis_id;
      }

      return null; // ambiguous — surface, don't guess
    },
  };
}
