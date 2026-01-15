import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, MessageCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatQuery } from "@/hooks/useChatQuery";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: Date;
}

const CHAT_OPEN_KEY = "mgp-chat-open";

export function ChatPanel() {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(CHAT_OPEN_KEY);
    return stored === null ? true : stored === "true";
  });

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

  // Persist open state
  useEffect(() => {
    localStorage.setItem(CHAT_OPEN_KEY, String(isOpen));
  }, [isOpen]);

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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await processQuery(input.trim());
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
      <div className="p-4 border-t border-terminal-green/20">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about games or odds..."
            className="flex-1 font-mono text-sm bg-background border-terminal-green/30 focus-visible:ring-terminal-green/50"
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

  // Mobile: Use Sheet (slide-up modal)
  if (isMobile) {
    return (
      <>
        {/* Floating button when closed */}
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
                onClick={() => setIsOpen(true)}
                className="h-14 px-5 bg-terminal-green hover:bg-terminal-green/90 text-background font-mono rounded-full shadow-lg shadow-terminal-green/20 flex items-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                <span className="text-sm font-semibold">Ask MGP</span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Sheet */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent 
            side="bottom" 
            className="h-[85vh] p-0 bg-card border-terminal-green/30"
          >
            <SheetHeader className="p-4 border-b border-terminal-green/20">
              <SheetTitle className="font-mono font-bold text-foreground text-lg">
                MGP Analyst
              </SheetTitle>
              <SheetDescription className="font-mono text-xs text-muted-foreground">
                Ask me about upcoming NFL games, odds, or teams
              </SheetDescription>
            </SheetHeader>
            {chatContent}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop: Side panel
  return (
    <>
      {/* Collapsed state - toggle button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40"
          >
            <Button
              onClick={() => setIsOpen(true)}
              className="h-auto py-4 px-2 bg-terminal-green hover:bg-terminal-green/90 text-background font-mono rounded-l-lg rounded-r-none shadow-lg shadow-terminal-green/20 flex flex-col items-center gap-2"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              <span className="text-xs font-semibold writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>
                Ask MGP
              </span>
              <MessageCircle className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Open panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 h-full w-[380px] bg-card border-l border-terminal-green/30 shadow-2xl shadow-black/20 z-40 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-terminal-green/20">
              <div>
                <h2 className="font-mono font-bold text-foreground text-lg">MGP Analyst</h2>
                <p className="font-mono text-xs text-muted-foreground">
                  Ask about NFL games, odds, or teams
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-terminal-green/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {chatContent}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
