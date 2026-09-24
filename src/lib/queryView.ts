// What a screen may show for a React Query result. Empty-state copy ("no
// streaks", "no hitters yet") belongs to "ready" only, i.e. after a read that
// succeeded and came back empty.
//
// Why not isLoading: in React Query 5 a first fetch that is PAUSED (offline, or
// a retry held while the tab is hidden) has isLoading false and isError false,
// so pages that checked only those two fell through to their empty states.
// QC reproduced it on MLB Players with a supabase-js AbortError on first read.

export type QueryView = "ready" | "loading" | "waiting" | "error";

interface QueryLike {
  data: unknown;
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
}

export function queryView(q: QueryLike): QueryView {
  // Last good data stays on screen, even while a refresh fails or waits.
  if (q.data !== undefined) return "ready";
  // Offline, or a retry paused until the tab is focused / online again.
  if (q.fetchStatus === "paused") return "waiting";
  // Retries exhausted and nothing in flight: a real failure.
  if (q.status === "error" && q.fetchStatus === "idle") return "error";
  // First load, or a retry in flight after an error.
  return "loading";
}
