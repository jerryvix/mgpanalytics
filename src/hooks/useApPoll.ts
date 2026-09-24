import { useQuery } from "@tanstack/react-query";
import { fetchApPoll, type ApPoll } from "@/lib/apPoll";

// The live AP Top 25 (college football). Polls come out once a week, so a
// 30 minute cache is plenty; react-query shares one request across the slate.
export function useApPoll(): { poll: ApPoll | null; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["ap-poll", "NCAAF"],
    queryFn: ({ signal }) => fetchApPoll(signal),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  return { poll: data ?? null, loading: isLoading };
}
