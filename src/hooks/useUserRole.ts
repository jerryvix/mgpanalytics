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
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (error) {
          console.error("Error fetching user role:", error);
          setRole("user"); // Default to user role on error
        } else {
          setRole(highestRole(data));
        }
      } catch (err) {
        console.error("Error fetching user role:", err);
        setRole("user");
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [user]);

  return {
    role,
    isAdmin: role === "admin",
    loading,
  };
}
