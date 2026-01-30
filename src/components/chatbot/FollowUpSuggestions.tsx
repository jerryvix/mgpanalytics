import { motion } from "framer-motion";
import { Zap } from "lucide-react";

interface Suggestion {
  text: string;
  query: string;
}

interface FollowUpSuggestionsProps {
  suggestions: Suggestion[];
  onSuggestionClick: (query: string) => void;
}

export function FollowUpSuggestions({ suggestions, onSuggestionClick }: FollowUpSuggestionsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.3 }}
      className="flex flex-wrap gap-2 mt-3"
    >
      {suggestions.slice(0, 3).map((suggestion, index) => (
        <motion.button
          key={index}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 + index * 0.1, duration: 0.2 }}
          onClick={() => onSuggestionClick(suggestion.query)}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-mono
            bg-terminal-green/10 hover:bg-terminal-green/20
            border border-terminal-green/20 hover:border-terminal-green/40
            rounded-full text-foreground/80 hover:text-foreground
            transition-all duration-200 cursor-pointer
            hover:shadow-sm hover:shadow-terminal-green/10"
        >
          <Zap className="w-3 h-3 text-terminal-green shrink-0" />
          <span className="truncate max-w-[140px] md:max-w-[200px]">{suggestion.text}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}
