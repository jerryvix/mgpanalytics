import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleChat: () => void;
  openChat: () => void;
  pendingQuery: string;
  setPendingQuery: (query: string) => void;
  openWithQuery: (query: string) => void;
  // Active sports for multi-sport chat queries
  activeSports: string[];
  setActiveSports: (sports: string[]) => void;
  // Chat history
  conversations: Conversation[];
  conversationsLoading: boolean;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  startNewConversation: () => void;
  loadConversation: (id: string) => void;
  refreshConversations: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const CHAT_OPEN_KEY = "mgp-chat-open";

export function ChatProvider({ children }: { children: ReactNode }) {
  
  const [pendingQuery, setPendingQuery] = useState("");
  const [activeSports, setActiveSports] = useState<string[]>(["NFL", "NBA", "NCAAB"]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(CHAT_OPEN_KEY);
    if (stored === null) return false;
    return stored === "true";
  });

  const [mounted, setMounted] = useState(false);

  // Fetch conversations
  const refreshConversations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setConversations([]);
        setConversationsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setConversations((data || []) as Conversation[]);
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  // Load conversations on mount
  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Load preferred sports from user profile on mount
  useEffect(() => {
    async function loadPreferredSports() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("preferred_sports")
          .eq("id", user.id)
          .single();
        if (profile?.preferred_sports?.length) {
          setActiveSports(profile.preferred_sports);
        }
      } catch (e) {
        console.error("Error loading preferred sports:", e);
      }
    }
    loadPreferredSports();
  }, []);

  // Set initial state after mount - default to open on desktop, closed on mobile
  useEffect(() => {
    if (!mounted) {
      const stored = localStorage.getItem(CHAT_OPEN_KEY);
      if (stored === null) {
        const isMobileWidth = window.innerWidth < 768;
        setIsOpen(!isMobileWidth);
      }
      setMounted(true);
    }
  }, [mounted]);

  // Persist state
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(CHAT_OPEN_KEY, String(isOpen));
    }
  }, [isOpen, mounted]);

  const toggleChat = () => setIsOpen((prev) => !prev);
  
  const openChat = () => setIsOpen(true);

  const openWithQuery = (query: string) => {
    setPendingQuery(query);
    setActiveConversationId(null); // Start fresh conversation
    setIsOpen(true);
  };

  const startNewConversation = () => {
    setActiveConversationId(null);
    setIsOpen(true);
  };

  const loadConversation = (id: string) => {
    setActiveConversationId(id);
    setIsOpen(true);
  };

  return (
    <ChatContext.Provider value={{
      isOpen,
      setIsOpen,
      toggleChat,
      openChat,
      pendingQuery,
      setPendingQuery,
      openWithQuery,
      activeSports,
      setActiveSports,
      conversations,
      conversationsLoading,
      activeConversationId,
      setActiveConversationId,
      startNewConversation,
      loadConversation,
      refreshConversations,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
