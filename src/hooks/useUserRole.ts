import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "user" | "moderator";

interface UseUserRoleResult {
  role: AppRole | null;
  isAdmin: boolean;
  loading: boolean;
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
          .eq("user_id", user.id)
          .single();

        if (error) {
          console.error("Error fetching user role:", error);
          setRole("user"); // Default to user role on error
        } else {
          setRole(data?.role as AppRole ?? "user");
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
