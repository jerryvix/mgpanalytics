import { motion } from "framer-motion";
import { Zap, Loader2 } from "lucide-react";
import { useSuggestedPrompts, SuggestedPrompt } from "@/hooks/useSuggestedPrompts";

interface WelcomeSuggestionsProps {
  onSuggestionClick: (query: string) => void;
}

export function WelcomeSuggestions({ onSuggestionClick }: WelcomeSuggestionsProps) {
  const { prompts, isLoading } = useSuggestedPrompts();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Loading suggestions...</span>
      </div>
    );
  }

  if (!prompts || prompts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.3 }}
      className="mt-4"
    >
      <p className="text-xs text-muted-foreground mb-2 font-mono">Try asking:</p>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt, index) => (
          <motion.button
            key={index}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 + index * 0.1, duration: 0.2 }}
            onClick={() => onSuggestionClick(prompt.query)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-mono
              bg-terminal-green/10 hover:bg-terminal-green/20
              border border-terminal-green/20 hover:border-terminal-green/40
              rounded-full text-foreground/80 hover:text-foreground
              transition-all duration-200 cursor-pointer
              hover:shadow-sm hover:shadow-terminal-green/10"
          >
            <Zap className="w-3 h-3 text-terminal-green shrink-0" />
            <span className="truncate max-w-[140px] md:max-w-[200px]">{prompt.text}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
