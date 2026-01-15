import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

interface ChatContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleChat: () => void;
  pendingQuery: string;
  setPendingQuery: (query: string) => void;
  openWithQuery: (query: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const CHAT_OPEN_KEY = "mgp-chat-open";

export function ChatProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [pendingQuery, setPendingQuery] = useState("");
  
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(CHAT_OPEN_KEY);
    // Default: open on desktop, closed on mobile
    if (stored === null) return false; // Will be set properly after mount
    return stored === "true";
  });

  const [mounted, setMounted] = useState(false);

  // Set initial state based on device after mount
  useEffect(() => {
    if (!mounted) {
      const stored = localStorage.getItem(CHAT_OPEN_KEY);
      if (stored === null) {
        // First time: desktop open, mobile closed
        setIsOpen(!isMobile);
      }
      setMounted(true);
    }
  }, [isMobile, mounted]);

  // Persist state
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(CHAT_OPEN_KEY, String(isOpen));
    }
  }, [isOpen, mounted]);

  const toggleChat = () => setIsOpen((prev) => !prev);

  const openWithQuery = (query: string) => {
    setPendingQuery(query);
    setIsOpen(true);
  };

  return (
    <ChatContext.Provider value={{ isOpen, setIsOpen, toggleChat, pendingQuery, setPendingQuery, openWithQuery }}>
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
