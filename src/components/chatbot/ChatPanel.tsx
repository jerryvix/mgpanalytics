import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, MessageCircle, PanelRightClose, PanelRightOpen, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGeminiChat } from "@/hooks/useGeminiChat";
import { useChat } from "@/contexts/ChatContext";
import { useIsMobile } from "@/hooks/use-mobile";

import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Source {
  title: string;
  url: string;
}

type QuestionType = "MARKET_SPECIFIC" | "CONTEXTUAL" | "FACTUAL";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: Date;
  sources?: Source[];
  questionType?: QuestionType;
}

const WELCOME_MESSAGE = "Welcome to the MGP Analyst. Think of me as your research assistant — I surface the data, you draw the conclusions.\n\nAsk me about games, odds, player stats, or matchups across NFL, NBA, NCAAB, and more. I'll share what I find and help you dig deeper.\n\nWhat would you like to explore?";

function getQuestionTypeFooter(questionType?: QuestionType): string | null {
  switch (questionType) {
    case "MARKET_SPECIFIC":
      return "Lines reflect current market data. Updated moments ago.";
    case "CONTEXTUAL":
    case "FACTUAL":
      return "Context based on publicly available game results, not live market odds.";
    default:
      return null;
  }
}

export function ChatPanel() {
  const { 
    isOpen, 
    toggleChat, 
    pendingQuery, 
    setPendingQuery,
    activeConversationId,
    setActiveConversationId,
    refreshConversations
  } = useChat();
  

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "bot",
      content: WELCOME_MESSAGE,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const MIN_PANEL_WIDTH = 320;
  const MAX_PANEL_WIDTH = 800;
  const DEFAULT_PANEL_WIDTH = 380;

  const [panelWidth, setPanelWidth] = useState(() => {
    const stored = localStorage.getItem("chat-panel-width");
    const parsed = stored ? parseInt(stored, 10) : DEFAULT_PANEL_WIDTH;
    return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, parsed || DEFAULT_PANEL_WIDTH));
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Dragging left edge: moving left = wider, moving right = narrower
      const delta = dragStartX.current - e.clientX;
      const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, dragStartWidth.current + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Persist final width
      localStorage.setItem("chat-panel-width", String(panelWidth));
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, panelWidth]);

  // Persist width on change (debounced via mouseup above, but also catch state)
  useEffect(() => {
    if (!isDragging) {
      localStorage.setItem("chat-panel-width", String(panelWidth));
    }
  }, [panelWidth, isDragging]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { sendMessage: sendGeminiMessage } = useGeminiChat();
  
  // Track conversation history for Gemini
  const [conversationHistory, setConversationHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  // Load messages when activeConversationId changes
  useEffect(() => {
    if (activeConversationId) {
      loadConversationMessages(activeConversationId);
    } else if (activeConversationId === null && currentConversationId !== null) {
      // Starting a new conversation - reset to welcome message
      setMessages([
        {
          id: "welcome",
          role: "bot",
          content: WELCOME_MESSAGE,
          timestamp: new Date(),
        },
      ]);
      setCurrentConversationId(null);
      setConversationHistory([]); // Reset Gemini history for new conversation
    }
  }, [activeConversationId]);

  const loadConversationMessages = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const loadedMessages: Message[] = data.map(msg => ({
          id: msg.id,
          role: msg.role as "user" | "bot",
          content: msg.content,
          timestamp: new Date(msg.created_at),
        }));
        setMessages(loadedMessages);
        setCurrentConversationId(convId);

        // Rebuild Gemini conversation history from loaded messages
        const rebuiltHistory = data.map(msg => ({
          role: (msg.role === "bot" ? "assistant" : "user") as "user" | "assistant",
          content: msg.content,
        }));
        setConversationHistory(rebuiltHistory);
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

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
      setTimeout(() => {
        handleSendWithQuery(pendingQuery);
      }, 100);
    }
  }, [pendingQuery, isOpen]);

  const createNewConversation = async (firstMessage: string): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const title = firstMessage.length > 50 
        ? firstMessage.substring(0, 47) + "..." 
        : firstMessage;

      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title })
        .select()
        .single();

      if (error) throw error;
      
      refreshConversations();
      return data.id;
    } catch (error) {
      console.error("Error creating conversation:", error);
      return null;
    }
  };

  const saveMessage = async (convId: string, role: "user" | "bot", content: string) => {
    try {
      await supabase
        .from("messages")
        .insert({ conversation_id: convId, role, content });

      // Update conversation's updated_at
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", convId);
    } catch (error) {
      console.error("Error saving message:", error);
    }
  };

  const handleClearChat = async () => {
    // Delete messages from DB if we have a current conversation
    if (currentConversationId) {
      try {
        await supabase
          .from("messages")
          .delete()
          .eq("conversation_id", currentConversationId);
        
        // Also delete the conversation itself
        await supabase
          .from("conversations")
          .delete()
          .eq("id", currentConversationId);
        
        refreshConversations();
      } catch (error) {
        console.error("Error deleting messages:", error);
      }
    }

    // Reset local state
    setMessages([
      {
        id: "welcome",
        role: "bot",
        content: WELCOME_MESSAGE,
        timestamp: new Date(),
      },
    ]);
    setCurrentConversationId(null);
    setActiveConversationId(null);
    setConversationHistory([]);
  };

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

    // Create or use existing conversation
    let convId = currentConversationId;
    if (!convId) {
      convId = await createNewConversation(query.trim());
      if (convId) {
        setCurrentConversationId(convId);
        setActiveConversationId(convId);
      }
    }

    // Save user message
    if (convId) {
      await saveMessage(convId, "user", query.trim());
    }

    // Update conversation history for Gemini
    const newHistory = [...conversationHistory, { role: "user" as const, content: query.trim() }];
    setConversationHistory(newHistory);

    try {
      // Call Gemini with conversation history
      const response = await sendGeminiMessage(newHistory);
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        content: response.content,
        timestamp: new Date(),
        sources: response.sources,
        questionType: response.questionType,
      };
      setMessages((prev) => [...prev, botMessage]);
      
      // Update history with assistant response
      setConversationHistory([...newHistory, { role: "assistant", content: response.content }]);

      // Save bot response
      if (convId) {
        await saveMessage(convId, "bot", response.content);
        refreshConversations();
      }
    } catch (error) {
      console.error("Gemini chat error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        content: "Oops, having trouble connecting to the AI. Try again in a moment.",
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

  const ClearChatButton = () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Clear chat"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Clear this chat?</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            This will remove all messages from the current conversation. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-muted text-foreground hover:bg-muted/80">Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleClearChat}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Clear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const chatContent = (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-2 md:space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] md:max-w-[70%] rounded-lg px-4 py-2.5 font-mono text-sm break-words ${
                  message.role === "user"
                    ? "bg-muted text-foreground"
                    : "bg-terminal-green/10 border border-terminal-green/20"
                }`}
                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
              >
                {message.role === "user" ? (
                  <p className="text-foreground">{message.content}</p>
                ) : (
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
                )}
                {/* Question type footer for bot messages */}
                {message.role === "bot" && message.id !== "welcome" && getQuestionTypeFooter(message.questionType) && (
                  <p className="text-[10px] text-muted-foreground/70 mt-2 italic">
                    {getQuestionTypeFooter(message.questionType)}
                  </p>
                )}
                {message.role === "bot" && (
                  <p className="text-xs md:text-[10px] text-muted-foreground mt-1.5">
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

      {/* Context warning */}
      {messages.length >= 16 && (
        <div className="px-4 py-2 bg-yellow-500/10 border-t border-yellow-500/20 text-xs text-yellow-400 font-mono text-center">
          Long conversation — older messages may lose context. Consider starting a new chat for fresh topics.
        </div>
      )}

      {/* Input */}
      <div
        className="p-4 border-t border-border bg-card"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about games, odds, or teams..."
            className="flex-1 font-mono text-base md:text-sm bg-background border-border focus-visible:ring-terminal-green/50"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-terminal-green hover:bg-terminal-green/90 text-background h-11 w-11 p-0 shrink-0"
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );

  const isMobile = useIsMobile();

  // Mobile: full-screen overlay (managed by BottomNav toggle)
  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-40 bg-card flex flex-col"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            {/* Mobile header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleChat}
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h2 className="font-mono font-bold text-foreground text-sm">MGP Analyst</h2>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Games, odds & insights
                  </p>
                </div>
              </div>
              <ClearChatButton />
            </div>

            {/* Chat content fills remaining space, input padded for bottom nav */}
            <div className="flex flex-col flex-1 min-h-0">
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-4 py-2.5 font-mono text-sm break-words ${
                          message.role === "user"
                            ? "bg-muted text-foreground"
                            : "bg-terminal-green/10 border border-terminal-green/20"
                        }`}
                        style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                      >
                        {message.role === "user" ? (
                          <p className="text-foreground">{message.content}</p>
                        ) : (
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
                        )}
                        {/* Question type footer for bot messages */}
                        {message.role === "bot" && message.id !== "welcome" && getQuestionTypeFooter(message.questionType) && (
                          <p className="text-[10px] text-muted-foreground/70 mt-2 italic">
                            {getQuestionTypeFooter(message.questionType)}
                          </p>
                        )}
                        {message.role === "bot" && (
                          <p className="text-xs text-muted-foreground mt-1.5">
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

              {/* Context warning */}
              {messages.length >= 16 && (
                <div className="px-4 py-2 bg-yellow-500/10 border-t border-yellow-500/20 text-xs text-yellow-400 font-mono text-center">
                  Long conversation — older messages may lose context. Consider starting a new chat for fresh topics.
                </div>
              )}

              {/* Mobile input — padded for bottom nav + safe area */}
              <div
                className="p-4 border-t border-border bg-card"
                style={{ paddingBottom: "max(calc(3.5rem + env(safe-area-inset-bottom, 0px) + 0.5rem), 1rem)" }}
              >
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about games, odds, or teams..."
                    className="flex-1 font-mono text-base bg-background border-border focus-visible:ring-terminal-green/50"
                    disabled={isLoading}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="bg-terminal-green hover:bg-terminal-green/90 text-background h-11 w-11 p-0 shrink-0"
                    aria-label="Send message"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Desktop/tablet: docked side panel layout
  return (
    <div className="relative flex h-full">
      {/* Collapsed state - slim vertical tab */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-14 h-full bg-card border-l border-border flex flex-col items-center py-4"
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
              <div
                className="px-2 py-3 rounded-md bg-terminal-green/10 border border-terminal-green/30"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                <span className="text-xs font-semibold tracking-wider text-terminal-green">
                  MGP ANALYST
                </span>
              </div>
            </div>
            <MessageCircle className="w-4 h-4 text-terminal-green mt-3" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={isDragging ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
            className="h-full bg-card border-l border-border flex flex-col overflow-hidden relative"
          >
            {/* Drag handle — left edge */}
            <div
              onMouseDown={handleDragStart}
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group"
            >
              <div className={`absolute inset-y-0 left-0 w-full transition-colors ${
                isDragging ? "bg-terminal-green/40" : "bg-transparent group-hover:bg-terminal-green/20"
              }`} />
              {/* Visible drag indicator — centered dot cluster */}
              <div className="absolute top-1/2 -translate-y-1/2 left-0 w-1.5 flex flex-col items-center gap-1 py-2">
                <div className={`w-1 h-1 rounded-full transition-colors ${isDragging ? "bg-terminal-green" : "bg-muted-foreground/30 group-hover:bg-terminal-green/60"}`} />
                <div className={`w-1 h-1 rounded-full transition-colors ${isDragging ? "bg-terminal-green" : "bg-muted-foreground/30 group-hover:bg-terminal-green/60"}`} />
                <div className={`w-1 h-1 rounded-full transition-colors ${isDragging ? "bg-terminal-green" : "bg-muted-foreground/30 group-hover:bg-terminal-green/60"}`} />
              </div>
            </div>

            {/* Header */}
            <div data-coach="chat-panel" className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-terminal-green" />
                <div>
                  <h2 className="font-mono font-bold text-foreground">MGP Analyst</h2>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Games, odds & insights
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <ClearChatButton />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleChat}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <PanelRightOpen className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {chatContent}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}