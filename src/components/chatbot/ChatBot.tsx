import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatModal } from "./ChatModal";

export function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
        className="fixed bottom-6 right-6 z-50 mb-safe"
      >
        <Button
          onClick={() => setIsOpen(true)}
          className="h-14 px-5 bg-terminal-green hover:bg-terminal-green/90 text-background font-mono rounded-full shadow-lg shadow-terminal-green/20 flex items-center gap-2"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">Ask MGP</span>
        </Button>
      </motion.div>

      {/* Chat Modal */}
      <AnimatePresence>
        {isOpen && <ChatModal onClose={() => setIsOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
