import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_INSTRUCTION = `You are the MGP Analyst, a professional sports betting and analytics expert. Provide concise, data-driven insights on NFL, NBA, and NCAAB games and odds using real-time search data when needed.

RESPONSE FORMATTING (CRITICAL - always follow these rules):

1. For PLAYER STATS responses, use this exact structure:
   **[Player Name] — Season Overview**
   
   [One neutral sentence summary of their season, optional]
   
   **Passing:** (if applicable)
   • Yards: X,XXX
   • Yards per game: XX.X
   • Touchdowns: XX
   • TDs per game: X.X
   • Interceptions: XX
   • Completion %: XX.X%
   • Passer rating: XXX.X
   
   **Rushing:** (if applicable)
   • Yards: XXX
   • Yards per game: XX.X
   • Touchdowns: XX
   • Yards per carry: X.X
   
   **Receiving:** (if applicable)
   • Receptions: XX
   • Yards: XXX
   • Yards per game: XX.X
   • Touchdowns: XX
   • Targets: XX

2. For GAME/ODDS responses:
   **[Away Team] @ [Home Team]**
   *[Date/Time]*
   
   **Current Lines:**
   • Spread: [Team] [Line] ([Odds])
   • Total: [Number] (O [Odds] / U [Odds])
   • Moneyline: [Home] [Odds] | [Away] [Odds]
   
   **Key Factors:**
   • [Bullet point 1]
   • [Bullet point 2]
   • [Bullet point 3]

3. For ANALYSIS/INSIGHTS responses:
   Use clear section headers with **bold**
   Use bullet points (•) for lists, never long paragraphs
   Keep each bullet under 20 words
   Separate sections with blank lines

GENERAL RULES:
- Be direct and factual - avoid fluff and hype
- Use current data from search when discussing live odds, scores, or recent games
- Format all numbers clearly with commas for thousands
- Calculate per-game averages when you have totals and games played
- Do NOT emphasize fantasy points unless specifically asked
- Keep tone analytical and neutral, not promotional
- Use bullet points (•) extensively for scannability
- Each response should feel like a professional analyst terminal, not a chat transcript`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json() as { messages: ChatMessage[] };
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing chat request with", messages.length, "messages");

    // Build conversation history for Gemini
    const contents = messages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Gemini API request with Google Search grounding
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          tools: [
            {
              googleSearch: {},
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to get AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Gemini response received");

    // Extract the text response
    const textContent = data.candidates?.[0]?.content?.parts?.find(
      (part: { text?: string }) => part.text
    );
    const responseText = textContent?.text || "I couldn't generate a response. Please try again.";

    // Extract grounding metadata (search sources)
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const sources: { title: string; url: string }[] = [];

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri && chunk.web?.title) {
          // Avoid duplicates
          if (!sources.some(s => s.url === chunk.web.uri)) {
            sources.push({
              title: chunk.web.title,
              url: chunk.web.uri,
            });
          }
        }
      }
    }

    // Also check searchEntryPoint for additional context
    if (groundingMetadata?.webSearchQueries) {
      console.log("Search queries used:", groundingMetadata.webSearchQueries);
    }

    console.log("Extracted", sources.length, "sources");

    return new Response(
      JSON.stringify({
        content: responseText,
        sources,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in gemini-chat:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
