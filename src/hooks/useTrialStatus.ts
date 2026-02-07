import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_SPORTS = ["NFL", "NBA", "NCAAB"];

interface TrialStatus {
  isInTrial: boolean;
  trialEndsAt: Date | null;
  daysRemaining: number;
  onboardingCompleted: boolean;
  onboardingPath: string | null;
  preferredSports: string[];
  loading: boolean;
}

export function useTrialStatus(): TrialStatus {
  const [status, setStatus] = useState<TrialStatus>({
    isInTrial: false,
    trialEndsAt: null,
    daysRemaining: 0,
    onboardingCompleted: false,
    onboardingPath: null,
    preferredSports: DEFAULT_SPORTS,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchTrialStatus() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("trial_started_at, trial_ends_at, onboarding_completed, onboarding_path, preferred_sports")
          .eq("id", user.id)
          .single();

        if (error || !profile || cancelled) {
          // If query fails (e.g. columns don't exist yet), treat as onboarding completed
          // so the modal doesn't block the user
          setStatus(prev => ({ ...prev, loading: false, onboardingCompleted: true }));
          return;
        }

        const now = new Date();
        const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
        const isInTrial = trialEndsAt ? now < trialEndsAt : false;
        const daysRemaining = trialEndsAt
          ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

        const preferredSports = (profile.preferred_sports && profile.preferred_sports.length > 0)
          ? profile.preferred_sports
          : DEFAULT_SPORTS;

        setStatus({
          isInTrial,
          trialEndsAt,
          daysRemaining,
          onboardingCompleted: profile.onboarding_completed ?? false,
          onboardingPath: profile.onboarding_path ?? null,
          preferredSports,
          loading: false,
        });
      } catch {
        if (!cancelled) {
          setStatus(prev => ({ ...prev, loading: false, onboardingCompleted: true }));
        }
      }
    }

    fetchTrialStatus();
    return () => { cancelled = true; };
  }, []);

  return status;
}
