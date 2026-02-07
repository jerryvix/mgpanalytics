import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Source {
  title: string;
  url: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type QuestionType = "MARKET_SPECIFIC" | "CONTEXTUAL" | "FACTUAL";

interface GeminiResponse {
  content: string;
  sources: Source[];
  questionType?: QuestionType;
}

export function useGeminiChat() {
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(
    async (messages: ChatMessage[]): Promise<GeminiResponse> => {
      setIsLoading(true);

      try {
        const { data, error } = await supabase.functions.invoke("gemini-chat", {
          body: { messages },
        });

        if (error) {
          console.error("Gemini chat error:", error);
          throw new Error(error.message || "Failed to get response");
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        return {
          content: data?.content || "I couldn't generate a response.",
          sources: data?.sources || [],
          questionType: data?.questionType,
        };
      } catch (err) {
        console.error("Error calling Gemini:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { sendMessage, isLoading };
}
