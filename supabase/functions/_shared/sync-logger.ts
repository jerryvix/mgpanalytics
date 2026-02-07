// Shared sync logging helper for all sync edge functions.
// Writes to sync_log table for historical audit trail.

export interface SyncLogParams {
  sport: string;
  data_type: string;
  function_name: string;
  trigger_source: string;
  api_source: string;
}

export interface SyncLogResult {
  status: "success" | "failed" | "partial";
  records_added?: number;
  records_updated?: number;
  records_failed?: number;
  api_requests_used?: number;
  api_requests_remaining?: number;
  error_message?: string;
  details?: Record<string, unknown>;
}

/**
 * Detect trigger source from request headers.
 * - x-cron-secret present → 'dispatch' (called by dispatch-syncs or cron)
 * - Authorization header → 'admin_manual' (called from admin panel)
 * - Otherwise → 'unknown'
 */
export function detectTriggerSource(req: Request): string {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) return "dispatch";
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) return "admin_manual";
  return "unknown";
}

/**
 * Start a sync log entry. Returns the log ID.
 * Call this at the beginning of a sync function.
 */
export async function startSyncLog(
  supabase: any,
  params: SyncLogParams
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("sync_log")
      .insert({
        sport: params.sport,
        data_type: params.data_type,
        function_name: params.function_name,
        trigger_source: params.trigger_source,
        api_source: params.api_source,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error(`[sync-logger] Failed to create sync_log entry:`, error.message);
      return null;
    }

    return data.id;
  } catch (err) {
    console.error(`[sync-logger] Unexpected error creating sync_log:`, err);
    return null;
  }
}

/**
 * Complete a sync log entry with results.
 * Call this at the end of a sync function (both success and error paths).
 */
export async function completeSyncLog(
  supabase: any,
  logId: string | null,
  startTime: number,
  result: SyncLogResult
): Promise<void> {
  if (!logId) return; // Gracefully skip if startSyncLog failed

  try {
    const now = Date.now();
    const { error } = await supabase
      .from("sync_log")
      .update({
        completed_at: new Date().toISOString(),
        duration_ms: now - startTime,
        status: result.status,
        records_added: result.records_added ?? 0,
        records_updated: result.records_updated ?? 0,
        records_failed: result.records_failed ?? 0,
        api_requests_used: result.api_requests_used ?? 0,
        api_requests_remaining: result.api_requests_remaining ?? null,
        error_message: result.error_message ?? null,
        details: result.details ?? {},
      })
      .eq("id", logId);

    if (error) {
      console.error(`[sync-logger] Failed to update sync_log ${logId}:`, error.message);
    }
  } catch (err) {
    console.error(`[sync-logger] Unexpected error updating sync_log:`, err);
  }
}
