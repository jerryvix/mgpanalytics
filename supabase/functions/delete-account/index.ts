// delete-account (audit O1, S7): deletes the signed-in person's account and their data.
//
// POST with the person's access token (Authorization: Bearer <jwt>). Deployed with
// verify_jwt on, and the function checks the token itself with auth.getUser.
//
// With the service role it deletes, in order:
//   1. conversations, whose messages go with them (messages.conversation_id is
//      ON DELETE CASCADE); conversations.user_id has no foreign key to auth.users
//   2. api_request_log rows (no foreign key to auth.users)
//   3. analyst_feedback and analyst_usage rows (both cascade from auth.users already;
//      deleted here too so nothing depends on the cascade)
//   4. the auth user (auth.admin.deleteUser), which cascades profiles, user_roles,
//      user_follows, user_capper_follows, user_streaks, user_x_connections,
//      x_oauth_states, analyst_feedback, analyst_usage and the auth sessions
//
// Data goes first, so a failure leaves the account in place to try again. Calling it
// twice is safe: a second call with a token whose account is already gone answers
// { ok: true } (the token's signature is still checked), and every delete is a no-op
// on rows that no longer exist.
//
// Answers { ok: true }, or { error } with 401 (no or bad token), 405 (not POST) or 500.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { getCorsHeaders } from "../_shared/cors.ts";

// User-owned tables without ON DELETE CASCADE to auth.users, plus the two that have it
const USER_TABLES = ["conversations", "api_request_log", "analyst_feedback", "analyst_usage"] as const;

async function deleteUserRows(admin: SupabaseClient, userId: string): Promise<string | null> {
  for (const table of USER_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) return `${table}: ${error.message}`;
  }
  return null;
}

const notFound = (e: { status?: number; code?: string; message?: string } | null) =>
  !!e && (e.code === "user_not_found" || e.status === 404 || /not found|does not exist/i.test(e.message ?? ""));

serve(async (req) => {
  const cors = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return json({ error: "Missing authorization" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("[delete-account] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return json({ error: "Service configuration error" }, 500);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: { user }, error: userError } = await admin.auth.getUser(token);

    if (userError || !user) {
      // Already deleted? A validly signed token whose account no longer exists means an
      // earlier call finished (its answer may have been lost): clear any rows left under
      // that id and answer ok. Anything else is a bad token.
      const { data: claimsData } = await admin.auth.getClaims(token).catch(() => ({ data: null }));
      const sub = claimsData?.claims?.sub;
      if (typeof sub === "string" && sub) {
        const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(sub);
        if (lookupError && !notFound(lookupError)) {
          console.error(`[delete-account] Account lookup failed for ${sub}: ${lookupError.message}`);
          return json({ error: "Could not verify account, try again" }, 500);
        }
        if (!existing?.user) {
          const leftover = await deleteUserRows(admin, sub);
          if (leftover) {
            console.error(`[delete-account] Cleanup after delete failed for ${sub}: ${leftover}`);
            return json({ error: "Could not delete account data" }, 500);
          }
          console.log(`[delete-account] Already deleted: ${sub}`);
          return json({ ok: true });
        }
      }
      return json({ error: "Unauthorized" }, 401);
    }

    const failed = await deleteUserRows(admin, user.id);
    if (failed) {
      console.error(`[delete-account] Data delete failed for ${user.id}: ${failed}`);
      return json({ error: "Could not delete account data" }, 500);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError && !notFound(deleteError)) {
      console.error(`[delete-account] Auth delete failed for ${user.id}: ${deleteError.message}`);
      return json({ error: "Could not delete account" }, 500);
    }

    console.log(`[delete-account] Deleted account ${user.id}`);
    return json({ ok: true });
  } catch (e) {
    console.error("[delete-account] Error:", e instanceof Error ? e.message : String(e));
    return json({ error: "Could not delete account" }, 500);
  }
});
