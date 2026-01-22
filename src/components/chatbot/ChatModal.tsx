import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatQuery } from "@/hooks/useChatQuery";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: Date;
}

interface ChatModalProps {
  onClose: () => void;
}

export function ChatModal({ onClose }: ChatModalProps) {
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
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    // Focus input on open
    inputRef.current?.focus();
  }, []);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-md sm:max-w-lg bg-card border border-terminal-green/30 rounded-lg shadow-2xl shadow-terminal-green/10 flex flex-col max-h-[80vh] sm:max-h-[600px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-terminal-green/20">
          <div>
            <h2 className="font-mono font-bold text-foreground text-lg">MGP Analyst</h2>
            <p className="font-mono text-xs text-muted-foreground">
              Ask me about upcoming NFL games, odds, or teams
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-terminal-green/10"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

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
                  {message.role === "user" ? (
                    <p className="text-foreground">{message.content}</p>
                  ) : (
                    <>
                      <div className="text-foreground prose prose-sm prose-invert max-w-none 
                        prose-headings:text-terminal-green prose-headings:font-mono prose-headings:font-semibold prose-headings:text-sm prose-headings:mb-2 prose-headings:mt-3 first:prose-headings:mt-0
                        prose-p:text-foreground prose-p:my-1 prose-p:leading-relaxed
                        prose-strong:text-terminal-green prose-strong:font-semibold
                        prose-ul:my-1 prose-ul:pl-0 prose-li:text-foreground prose-li:my-0.5 prose-li:pl-0
                        prose-li:marker:text-terminal-green/60
                        [&_ul]:list-disc [&_ul]:ml-4
                        [&_em]:text-muted-foreground [&_em]:not-italic [&_em]:text-xs
                      ">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {formatTime(message.timestamp)}
                      </p>
                    </>
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
      </motion.div>
    </motion.div>
  );
}
