import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TrialStatus {
  isInTrial: boolean;
  trialEndsAt: Date | null;
  daysRemaining: number;
  onboardingCompleted: boolean;
  onboardingPath: string | null;
  loading: boolean;
}

export function useTrialStatus(): TrialStatus {
  const [status, setStatus] = useState<TrialStatus>({
    isInTrial: false,
    trialEndsAt: null,
    daysRemaining: 0,
    onboardingCompleted: false,
    onboardingPath: null,
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
          .select("trial_started_at, trial_ends_at, onboarding_completed, onboarding_path")
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

        setStatus({
          isInTrial,
          trialEndsAt,
          daysRemaining,
          onboardingCompleted: profile.onboarding_completed ?? false,
          onboardingPath: profile.onboarding_path ?? null,
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
