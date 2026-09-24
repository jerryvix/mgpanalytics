import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "user" | "moderator";

interface UseUserRoleResult {
  role: AppRole | null;
  isAdmin: boolean;
  loading: boolean;
}

const ROLE_RANK: Record<AppRole, number> = { user: 0, moderator: 1, admin: 2 };

export const ROLE_TIMEOUT_MS = 8000;

// A user can hold several user_roles rows (a default 'user' row plus a granted
// 'admin' row), so resolve to the highest one instead of expecting exactly one.
export function highestRole(rows: { role: string | null }[] | null): AppRole {
  let best: AppRole = "user";
  for (const row of rows ?? []) {
    const role = row.role as AppRole;
    if (role in ROLE_RANK && ROLE_RANK[role] > ROLE_RANK[best]) best = role;
  }
  return best;
}

export function useUserRole(user: User | null): UseUserRoleResult {
  // Keyed by user id, not the User object: auth events (initial session, token
  // refresh) hand over a new object for the same user, and refetching on each
  // one let a slower, older response land last and overwrite the right role.
  const userId = user?.id ?? null;
  const [resolved, setResolved] = useState<{ userId: string; role: AppRole } | null>(null);

  useEffect(() => {
    // No session yet: stay "loading" rather than reporting a non-admin, which
    // made the admin route bounce before the role query had even run.
    // Logged-out visitors are sent away by the page itself.
    if (!userId) return;
    let cancelled = false;

    // A role query can stall (for example while another tab holds the auth
    // lock). Don't leave the admin route spinning: after ROLE_TIMEOUT_MS fall
    // back to "user", and let a late answer still upgrade the role.
    const timer = setTimeout(() => {
      if (!cancelled) {
        setResolved((prev) => (prev?.userId === userId ? prev : { userId, role: "user" }));
      }
    }, ROLE_TIMEOUT_MS);

    const load = async (attempt: number): Promise<void> => {
      let rows: { role: string | null }[] | null = null;
      let failed = false;
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        if (error) {
          failed = true;
          console.error("Error fetching user role:", error);
        } else {
          rows = data;
        }
      } catch (err) {
        failed = true;
        console.error("Error fetching user role:", err);
      }
      if (cancelled) return;
      // One retry covers a request that raced a token refresh.
      if (failed && attempt === 0) {
        setTimeout(() => {
          if (!cancelled) void load(1);
        }, 1000);
        return;
      }
      setResolved({ userId, role: failed ? "user" : highestRole(rows) });
    };

    void load(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId]);

  const role = userId !== null && resolved?.userId === userId ? resolved.role : null;
  return {
    role,
    isAdmin: role === "admin",
    loading: role === null,
  };
}
