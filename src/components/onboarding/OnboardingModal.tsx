import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Users, BarChart3, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useTrialStatus } from "@/hooks/useTrialStatus";

interface OnboardingModalProps {
  open: boolean;
  onComplete: (selectedSports?: string[]) => void;
  dismissible?: boolean;
}

const ORIENTATION_OPTIONS = [
  { id: "odds-lines", label: "Odds & Lines", icon: TrendingUp, description: "Track spreads, totals, and line movement" },
  { id: "player-research", label: "Player Research", icon: Users, description: "Stats, props, and performance trends" },
  { id: "trends-matchups", label: "Trends & Matchups", icon: BarChart3, description: "Historical data and situational analysis" },
  { id: "just-explore", label: "Just Explore", icon: Compass, description: "I'll look around and see what's here" },
] as const;

type OrientationId = typeof ORIENTATION_OPTIONS[number]["id"];

const AVAILABLE_SPORTS = [
  { id: "NFL", label: "NFL", emoji: "\uD83C\uDFC8" },
  { id: "NBA", label: "NBA", emoji: "\uD83C\uDFC0" },
  { id: "NCAAB", label: "NCAAB", emoji: "\uD83C\uDFC0" },
] as const;

export function OnboardingModal({ open, onComplete, dismissible = false }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [selectedPath, setSelectedPath] = useState<OrientationId | null>(null);
  const [selectedSports, setSelectedSports] = useState<string[]>(["NFL", "NBA", "NCAAB"]);
  const [saving, setSaving] = useState(false);
  const { trialEndsAt } = useTrialStatus();

  const toggleSport = (sportId: string) => {
    setSelectedSports(prev => {
      if (prev.includes(sportId)) {
        // Don't allow deselecting all
        if (prev.length <= 1) return prev;
        return prev.filter(s => s !== sportId);
      }
      return [...prev, sportId];
    });
  };

  const handleFinish = async () => {
    if (!selectedPath || selectedSports.length === 0) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({
            onboarding_completed: true,
            onboarding_path: selectedPath,
            preferred_sports: selectedSports,
          })
          .eq("id", user.id);
      }
    } catch (e) {
      console.error("Error saving onboarding:", e);
    } finally {
      setSaving(false);
      onComplete(selectedSports);
    }
  };

  const trialEndFormatted = trialEndsAt
    ? trialEndsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "14 days from now";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (dismissible && !isOpen) onComplete(); }}>
      <DialogContent
        className={`sm:max-w-md bg-card border-border ${!dismissible ? "[&>button]:hidden" : ""}`}
        onPointerDownOutside={(e) => { if (!dismissible) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!dismissible) e.preventDefault(); }}
        onInteractOutside={(e) => { if (!dismissible) e.preventDefault(); }}
      >
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="text-xl text-foreground font-bold">
                  Welcome to MGP
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm mt-2">
                  MGP helps you understand what markets are doing — not what to bet.
                </DialogDescription>
              </DialogHeader>
              <ul className="mt-4 space-y-3 text-sm text-foreground">
                <li className="flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-terminal-green mt-0.5 shrink-0" />
                  <span>Track lines, spreads, and odds movement across sportsbooks</span>
                </li>
                <li className="flex items-start gap-2">
                  <BarChart3 className="w-4 h-4 text-terminal-green mt-0.5 shrink-0" />
                  <span>Compare player performance and prop markets</span>
                </li>
                <li className="flex items-start gap-2">
                  <Compass className="w-4 h-4 text-terminal-green mt-0.5 shrink-0" />
                  <span>Explore context behind the numbers with an AI research assistant</span>
                </li>
              </ul>
              <div className="mt-6">
                <Button
                  onClick={() => setStep(2)}
                  className="w-full bg-terminal-green hover:bg-terminal-green/90 text-background font-semibold"
                >
                  Get Started
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="text-xl text-foreground font-bold">
                  Your 14-Day Free Trial
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm mt-2">
                  No credit card required. Full access to everything.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 p-4 bg-terminal-green/5 border border-terminal-green/20 rounded-lg">
                <p className="text-sm text-foreground">
                  Your trial runs through <span className="text-terminal-green font-medium">{trialEndFormatted}</span>.
                </p>
              </div>
              <div className="mt-6">
                <Button
                  onClick={() => setStep(3)}
                  className="w-full bg-terminal-green hover:bg-terminal-green/90 text-background font-semibold"
                >
                  Continue
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="text-xl text-foreground font-bold">
                  What interests you most?
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm mt-2">
                  We'll tailor your experience. You can always explore everything.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {ORIENTATION_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setSelectedPath(option.id)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border text-center transition-all ${
                      selectedPath === option.id
                        ? "border-terminal-green bg-terminal-green/10 text-foreground"
                        : "border-border bg-card/50 text-muted-foreground hover:border-terminal-green/50 hover:text-foreground"
                    }`}
                  >
                    <option.icon className={`w-6 h-6 ${selectedPath === option.id ? "text-terminal-green" : ""}`} />
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-[10px] leading-tight">{option.description}</span>
                  </button>
                ))}
              </div>
              <div className="mt-6">
                <Button
                  onClick={() => setStep(4)}
                  disabled={!selectedPath}
                  className="w-full bg-terminal-green hover:bg-terminal-green/90 text-background font-semibold disabled:opacity-50"
                >
                  Continue
                </Button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="text-xl text-foreground font-bold">
                  Which sports do you follow?
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm mt-2">
                  We'll prioritize these on your dashboard. You can change this anytime.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex flex-col gap-3">
                {AVAILABLE_SPORTS.map((sport) => {
                  const isSelected = selectedSports.includes(sport.id);
                  return (
                    <button
                      key={sport.id}
                      onClick={() => toggleSport(sport.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? "border-terminal-green bg-terminal-green/10 text-foreground"
                          : "border-border bg-card/50 text-muted-foreground hover:border-terminal-green/50 hover:text-foreground"
                      }`}
                    >
                      <span className="text-xl">{sport.emoji}</span>
                      <span className="text-sm font-medium">{sport.label}</span>
                      {isSelected && (
                        <span className="ml-auto text-terminal-green text-sm">&#10003;</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground text-center">
                At least 1 sport must be selected
              </p>
              <div className="mt-4">
                <Button
                  onClick={handleFinish}
                  disabled={selectedSports.length === 0 || saving}
                  className="w-full bg-terminal-green hover:bg-terminal-green/90 text-background font-semibold disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Let's Go"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
