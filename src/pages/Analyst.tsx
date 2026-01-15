import { useEffect } from "react";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";

const Analyst = () => {
  const { openChat, isOpen } = useChat();

  // Auto-open the chat panel when visiting this page
  useEffect(() => {
    if (!isOpen) {
      openChat();
    }
  }, [openChat, isOpen]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
    >
      <div className="w-16 h-16 rounded-full bg-terminal-green/20 flex items-center justify-center mb-6">
        <MessageCircle className="w-8 h-8 text-terminal-green" />
      </div>
      <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-3">
        MGP Analyst
      </h1>
      <p className="text-muted-foreground max-w-md text-sm mb-6">
        Your AI-powered sports analytics assistant. Ask about upcoming games, odds, spreads, and get real-time insights.
      </p>
      <div className="text-xs text-muted-foreground">
        The analyst panel is open on the right →
      </div>
    </motion.div>
  );
};

export default Analyst;
