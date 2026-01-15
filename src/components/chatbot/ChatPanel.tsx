import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, MessageCircle, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatQuery } from "@/hooks/useChatQuery";
import { useChat } from "@/contexts/ChatContext";
import { useIsMobile } from "@/hooks/use-mobile";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: Date;
}

export function ChatPanel() {
  const { isOpen, toggleChat, pendingQuery, setPendingQuery } = useChat();
  const isMobile = useIsMobile();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "bot",
      content: "Hey! I'm your MGP Analyst. Ask me about upcoming NFL games, odds, or teams. 🏈",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { processQuery } = useChatQuery();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle pending query from hero input
  useEffect(() => {
    if (pendingQuery && isOpen && !isLoading) {
      setInput(pendingQuery);
      setPendingQuery("");
      // Auto-submit after a short delay
      setTimeout(() => {
        handleSendWithQuery(pendingQuery);
      }, 100);
    }
  }, [pendingQuery, isOpen]);

  const handleSendWithQuery = async (query: string) => {
    if (!query.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await processQuery(query.trim());
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        content: "Oops, having trouble connecting. Try again in a moment.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    handleSendWithQuery(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const chatContent = (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 font-mono text-sm ${
                  message.role === "user"
                    ? "bg-muted text-foreground"
                    : "bg-terminal-green/10 border border-terminal-green/20"
                }`}
              >
                <p
                  className={message.role === "bot" ? "text-foreground whitespace-pre-wrap" : ""}
                  dangerouslySetInnerHTML={{
                    __html: message.content.replace(
                      /(\+?\-?\d+\.?\d*)/g,
                      '<span class="text-terminal-green font-semibold">$1</span>'
                    ),
                  }}
                />
                {message.role === "bot" && (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {formatTime(message.timestamp)}
                  </p>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-terminal-green/10 border border-terminal-green/20 rounded-lg px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-terminal-green" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about games or odds..."
            className="flex-1 font-mono text-sm bg-background border-border focus-visible:ring-terminal-green/50"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-terminal-green hover:bg-terminal-green/90 text-background"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  // Mobile: Full-screen slide-in panel
  if (isMobile) {
    return (
      <>
        {/* Floating toggle when closed */}
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="fixed bottom-6 right-6 z-50"
            >
              <Button
                onClick={toggleChat}
                className="h-14 px-5 bg-terminal-green hover:bg-terminal-green/90 text-background font-mono rounded-full shadow-lg shadow-terminal-green/20 flex items-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                <span className="text-sm font-semibold">Ask MGP</span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Full-screen panel */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 bg-card flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-terminal-green" />
                  <div>
                    <h2 className="font-mono font-bold text-foreground text-lg">MGP Analyst</h2>
                    <p className="font-mono text-xs text-muted-foreground">
                      NFL games, odds & teams
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleChat}
                  className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <PanelRightOpen className="w-5 h-5" />
                </Button>
              </div>

              {chatContent}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Desktop: Docked side panel (participates in layout)
  return (
    <div className="relative flex h-full">
      {/* Collapsed state - slim vertical tab */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-12 h-full bg-card border-l border-border flex flex-col items-center py-4"
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleChat}
              className="h-10 w-10 text-terminal-green hover:text-terminal-green hover:bg-terminal-green/10 mb-3"
            >
              <PanelRightClose className="w-5 h-5" />
            </Button>
            <div className="flex-1 flex items-center">
              <span
                className="text-xs font-mono text-muted-foreground font-semibold tracking-wider"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                MGP ANALYST
              </span>
            </div>
            <MessageCircle className="w-4 h-4 text-terminal-green/60 mt-3" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="h-full bg-card border-l border-border flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-terminal-green" />
                <div>
                  <h2 className="font-mono font-bold text-foreground">MGP Analyst</h2>
                  <p className="font-mono text-xs text-muted-foreground">
                    NFL games, odds & teams
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleChat}
                className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <PanelRightOpen className="w-5 h-5" />
              </Button>
            </div>

            {chatContent}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
