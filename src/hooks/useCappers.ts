import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Capper, CapperCategory, Sport, CapperTier } from "@/types/capper";
import { useToast } from "@/hooks/use-toast";

export interface CappersFilters {
  search?: string;
  sport?: Sport | 'all';
  category?: CapperCategory | 'all';
  tier?: CapperTier | 'all';
  sortBy?: 'mgp_followers' | 'x_followers_count' | 'added_at';
  featured?: boolean;
}

export function useCappers(filters: CappersFilters = {}) {
  return useQuery({
    queryKey: ['cappers', filters],
    queryFn: async () => {
      let query = supabase
        .from('cappers')
        .select('*');

      // Apply search filter
      if (filters.search) {
        query = query.or(`x_username.ilike.%${filters.search}%,x_display_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      // Apply sport filter
      if (filters.sport && filters.sport !== 'all') {
        query = query.contains('sports', [filters.sport]);
      }

      // Apply category filter
      if (filters.category && filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }

      // Apply tier filter
      if (filters.tier && filters.tier !== 'all') {
        query = query.eq('tier', filters.tier);
      }

      // Apply featured filter
      if (filters.featured) {
        query = query.eq('featured', true);
      }

      // Apply sorting
      const sortColumn = filters.sortBy || 'mgp_followers';
      query = query.order(sortColumn, { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      return data as Capper[];
    },
  });
}

export function useFeaturedCappers() {
  return useCappers({ featured: true, sortBy: 'mgp_followers' });
}

export function useUserCapperFollows() {
  return useQuery({
    queryKey: ['user-capper-follows'],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return [];

      const { data, error } = await supabase
        .from('user_capper_follows')
        .select('capper_id')
        .eq('user_id', session.session.user.id);

      if (error) throw error;
      return data.map(f => f.capper_id);
    },
  });
}

export function useFollowCapper() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (capperId: string) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        throw new Error('You must be logged in to follow cappers');
      }

      const { error } = await supabase
        .from('user_capper_follows')
        .insert({
          user_id: session.session.user.id,
          capper_id: capperId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-capper-follows'] });
      queryClient.invalidateQueries({ queryKey: ['cappers'] });
      toast({
        title: 'Followed!',
        description: 'Capper added to your feed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUnfollowCapper() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (capperId: string) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        throw new Error('You must be logged in to unfollow cappers');
      }

      const { error } = await supabase
        .from('user_capper_follows')
        .delete()
        .eq('user_id', session.session.user.id)
        .eq('capper_id', capperId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-capper-follows'] });
      queryClient.invalidateQueries({ queryKey: ['cappers'] });
      toast({
        title: 'Unfollowed',
        description: 'Capper removed from your feed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
