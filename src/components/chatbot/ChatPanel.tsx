import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, MessageCircle, PanelRightClose, PanelRightOpen, ExternalLink, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGeminiChat } from "@/hooks/useGeminiChat";
import { useChat } from "@/contexts/ChatContext";

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

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: Date;
  sources?: Source[];
}

const WELCOME_MESSAGE = "Hey! I'm your MGP Analyst. Ask me about upcoming games, odds, line movement, or teams across NFL, NBA, NCAAB, and more. 🏈🏀";

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
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
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
    setExpandedSources(new Set());
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

  const toggleSources = (messageId: string) => {
    setExpandedSources((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
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
                {/* Sources section for bot messages */}
                {message.role === "bot" && message.sources && message.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-terminal-green/20">
                    <button
                      onClick={() => toggleSources(message.id)}
                      className="flex items-center gap-1 text-[10px] text-terminal-green hover:text-terminal-green/80 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Sources ({message.sources.length})</span>
                      {expandedSources.has(message.id) ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                    <AnimatePresence>
                      {expandedSources.has(message.id) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 space-y-1">
                            {message.sources.map((source, idx) => (
                              <a
                                key={idx}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-[10px] text-muted-foreground hover:text-terminal-green transition-colors truncate"
                                title={source.title}
                              >
                                {idx + 1}. {source.title}
                              </a>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
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
            placeholder="Ask about games, odds, or teams..."
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

  // Always use desktop/tablet docked side panel layout
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