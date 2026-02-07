import { useState, useEffect } from "react";
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

  if (!visible) return null;

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
