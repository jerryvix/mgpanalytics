// Pure path helpers for dashboard navigation (Back fallback, section titles).

// Path prefixes with no screen of their own. Walking up from a market tool
// must not land on /dashboard/market, which renders a blank page.
const SCREENLESS_PARENTS = new Set(["/dashboard/market", "/dashboard/community"]);

export function isDashboardHome(pathname: string): boolean {
  return pathname === "/dashboard" || pathname === "/dashboard/";
}

/**
 * Where "back" lands when there is no in-app history to pop (deep link,
 * refresh, or a fresh tab): the nearest ancestor that is a real screen,
 * floored at the dashboard home.
 */
export function parentPath(pathname: string): string {
  let path = pathname.replace(/\/+$/, "");
  do {
    path = path.slice(0, path.lastIndexOf("/"));
  } while (SCREENLESS_PARENTS.has(path));
  return path.startsWith("/dashboard") ? path : "/dashboard";
}

const SPORT_TITLES: Record<string, string> = {
  nfl: "NFL",
  nba: "NBA",
  ncaab: "NCAAB",
  ncaaf: "NCAAF",
  mlb: "MLB",
};

const SECTION_TITLES: Record<string, string> = {
  analyst: "Analyst",
  watchlist: "Watchlist",
  chats: "Saved Chats",
  profile: "Profile",
  community: "Community",
  admin: "Admin",
  market: "Market",
};

const MARKET_TITLES: Record<string, string> = {
  "live-edges": "Live Edges",
  "game-finder": "Game Finder",
  "line-movement": "Line Movement",
  props: "Player Props",
  trends: "Trends",
};

/** Section name for the phone top bar ("" on home, where the brand shows). */
export function mobileTitleFor(pathname: string): string {
  const [section, sub] = pathname.replace(/^\/dashboard\/?/, "").split("/").filter(Boolean);
  if (!section) return "";
  if (SPORT_TITLES[section]) return SPORT_TITLES[section];
  if (section === "market" && sub) return MARKET_TITLES[sub] ?? "Market";
  if (section === "admin" && sub === "observatory") return "Sync Observatory";
  return SECTION_TITLES[section] ?? "";
}
