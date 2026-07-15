import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FollowEntity {
  entityType: "team" | "player";
  entityKey: string; // team: "SPORT:Team Name" | player: uuid
  entityLabel?: string;
  sport?: string;
}

export interface FollowRow {
  id: string;
  entity_type: "team" | "player";
  entity_key: string;
  entity_label: string | null;
  sport: string | null;
  created_at: string;
}

const makeKey = (t: string, k: string) => `${t}:${k}`;

export function useFollows() {
  const qc = useQueryClient();

  const { data: follows = [] } = useQuery<FollowRow[]>({
    queryKey: ["user-follows"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("user_follows")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data as FollowRow[]) || [];
    },
  });

  const keySet = new Set(follows.map((f) => makeKey(f.entity_type, f.entity_key)));
  const isFollowing = (e: FollowEntity) => keySet.has(makeKey(e.entityType, e.entityKey));

  const toggle = useMutation({
    mutationFn: async (e: FollowEntity) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to follow");
      if (keySet.has(makeKey(e.entityType, e.entityKey))) {
        await supabase
          .from("user_follows")
          .delete()
          .eq("user_id", user.id)
          .eq("entity_type", e.entityType)
          .eq("entity_key", e.entityKey);
      } else {
        await supabase.from("user_follows").insert({
          user_id: user.id,
          entity_type: e.entityType,
          entity_key: e.entityKey,
          entity_label: e.entityLabel ?? null,
          sport: e.sport ?? null,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-follows"] }),
  });

  return {
    follows,
    isFollowing,
    toggleFollow: (e: FollowEntity) => toggle.mutate(e),
    isToggling: toggle.isPending,
  };
}
