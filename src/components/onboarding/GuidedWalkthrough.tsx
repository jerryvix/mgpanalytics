import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { CoachMark } from "./CoachMark";

const WALKTHROUGH_KEY = "mgp-walkthrough-completed";

const STEPS = [
  {
    targetSelector: '[data-coach="hero-input"]',
    title: "Ask anything",
    description: "Type a question about any game, player, or market.",
  },
  {
    targetSelector: '[data-coach="sports-nav"]',
    title: "Browse by sport",
    description: "Browse games, odds, and stats by sport.",
  },
  {
    targetSelector: '[data-coach="chat-panel"]',
    title: "Your research assistant",
    description: "Ask follow-ups, compare data, dig deeper.",
  },
];

interface GuidedWalkthroughProps {
  onComplete: () => void;
}

export function GuidedWalkthrough({ onComplete }: GuidedWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Don't show if already completed
    if (localStorage.getItem(WALKTHROUGH_KEY) === "true") {
      onComplete();
      return;
    }
    setVisible(true);
  }, [onComplete]);

  const finish = () => {
    localStorage.setItem(WALKTHROUGH_KEY, "true");
    setVisible(false);
    onComplete();
  };

  const handleNext = () => {
    if (currentStep >= STEPS.length - 1) {
      finish();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  // The tour is written for the Home screen; anywhere else (deep links,
  // player pages) it must never gate the UI — it simply waits for Home.
  const onHome = location.pathname === "/dashboard" || location.pathname === "/dashboard/";

  // Auto-skip any step whose target isn't visibly on the page (e.g. the
  // chat-panel step while chat is closed). Without this, a step can stall
  // invisibly — or worse, trap taps behind the barrier.
  useEffect(() => {
    if (!visible || !onHome) return;
    const check = () => {
      const el = document.querySelector(STEPS[currentStep].targetSelector);
      const rect = el?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) handleNext();
    };
    const timer = setTimeout(check, 900); // allow the target to render first
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, onHome, currentStep, location.pathname]);

  if (!visible || !onHome) return null;

  const step = STEPS[currentStep];

  return (
    <AnimatePresence mode="wait">
      <CoachMark
        key={currentStep}
        targetSelector={step.targetSelector}
        title={step.title}
        description={step.description}
        stepNumber={currentStep + 1}
        totalSteps={STEPS.length}
        onNext={handleNext}
        onSkip={finish}
      />
    </AnimatePresence>
  );
}
