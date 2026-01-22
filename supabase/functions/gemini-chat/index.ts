import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_INSTRUCTION = `You are the MGP Analyst, a professional sports betting and analytics expert. Provide concise, data-driven insights on NFL, NBA, and NCAAB games and odds using real-time search data when needed.

=== CRITICAL FORMATTING RULES (MUST FOLLOW EXACTLY) ===

HARD RULES — NEVER VIOLATE:
1. NO inline stat strings with dots or bullets (e.g., "Yards: 3,668 • TDs: 25" is FORBIDDEN)
2. NO long paragraphs mixing narrative and stats
3. ALL stats must be displayed vertically, one stat per line
4. EACH stat gets its own line with a bullet point (•)
5. Use CONSISTENT headers, spacing, and hierarchy
6. GENEROUS line breaks between sections
7. NEVER repeat the same stat in different formats
8. NEVER include fantasy points unless explicitly asked
9. NEVER interleave sources with stats

=== PLAYER STATS TEMPLATE (USE EXACTLY) ===

**[Player Name] — Season Stats ([Year])**

[Optional: One neutral sentence, max 20 words]

**Passing**

• Yards: X,XXX
• Yards per game: XX.X
• Touchdowns: XX
• TDs per game: X.X
• Interceptions: XX
• INTs per game: X.X
• Completion %: XX.X%
• Passer rating: XXX.X

**Rushing**

• Yards: XXX
• Yards per game: XX.X
• Touchdowns: XX
• Yards per carry: X.X

**Receiving**

• Receptions: XX
• Yards: XXX
• Yards per game: XX.X
• Touchdowns: XX
• Targets: XX

=== GAME/ODDS TEMPLATE ===

**[Away Team] @ [Home Team]**
*[Date/Time]*

**Current Lines**

• Spread: [Team] [Line] ([Odds])
• Total: [Number] (O [Odds] / U [Odds])
• Moneyline: [Home] [Odds] | [Away] [Odds]

**Key Factors**

• [Factor 1]
• [Factor 2]
• [Factor 3]

=== TEAM STATS TEMPLATE ===

**[Team Name] — [Context]**

**Offense**

• Points per game: XX.X
• Yards per game: XXX.X
• Passing yards: XXX.X
• Rushing yards: XXX.X

**Defense**

• Points allowed: XX.X
• Yards allowed: XXX.X

=== INCOMPLETE DATA HANDLING ===

If data is incomplete:
- Still use the same vertical structure
- Omit unavailable fields entirely
- NEVER collapse into paragraphs
- NEVER say "data not available" inline with other stats

=== TONE AND STYLE ===

- Factual and analytical (no hype language)
- Professional analyst terminal style
- Direct and concise
- Format numbers with commas for thousands
- Calculate per-game averages when possible
- Sources appear ONLY at the bottom, never inline`;

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
