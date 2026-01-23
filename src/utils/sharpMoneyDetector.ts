// Sharp Money Detection Utilities

export interface BettingSide {
  team: string;
  betsPercent: number;
  moneyPercent: number;
}

export interface BettingLine {
  type: "spread" | "total" | "moneyline";
  line?: number;  // e.g., -3.5 for spread, 47.5 for total
  sideA: BettingSide;
  sideB: BettingSide;
}

export interface SharpIndicator {
  isSharp: boolean;
  direction: "sideA" | "sideB" | null;
  differential: number;
  description: string;
}

// Threshold for detecting sharp action (percentage point difference)
const SHARP_THRESHOLD = 10;

/**
 * Detect sharp money on a betting line
 * Sharp action = when % money significantly differs from % bets
 */
export function detectSharpMoney(line: BettingLine): SharpIndicator {
  const diffA = line.sideA.moneyPercent - line.sideA.betsPercent;
  const diffB = line.sideB.moneyPercent - line.sideB.betsPercent;
  
  // Check side A for sharp action (more money than bets)
  if (diffA >= SHARP_THRESHOLD) {
    return {
      isSharp: true,
      direction: "sideA",
      differential: diffA,
      description: `Sharp money on ${line.sideA.team} (${diffA.toFixed(0)}% more money than bets)`
    };
  }
  
  // Check side B for sharp action
  if (diffB >= SHARP_THRESHOLD) {
    return {
      isSharp: true,
      direction: "sideB",
      differential: diffB,
      description: `Sharp money on ${line.sideB.team} (${diffB.toFixed(0)}% more money than bets)`
    };
  }
  
  return {
    isSharp: false,
    direction: null,
    differential: Math.max(Math.abs(diffA), Math.abs(diffB)),
    description: "Public and sharps appear aligned"
  };
}

/**
 * Detect reverse line movement
 * RLM = line moves toward the side with fewer bets
 */
export function detectReverseLineMovement(
  openingLine: number,
  currentLine: number,
  publicSide: "sideA" | "sideB"
): { isRLM: boolean; description: string } {
  const lineMoved = currentLine - openingLine;
  
  // If line moved toward sideA (became more negative) but public is on sideA
  if (lineMoved < -0.5 && publicSide === "sideA") {
    return {
      isRLM: true,
      description: "⚠️ Reverse Line Movement: Line moved toward heavily bet side"
    };
  }
  
  // If line moved toward sideB (became more positive) but public is on sideB
  if (lineMoved > 0.5 && publicSide === "sideB") {
    return {
      isRLM: true,
      description: "⚠️ Reverse Line Movement: Line moved toward heavily bet side"
    };
  }
  
  return { isRLM: false, description: "" };
}

/**
 * Format betting percentages for display
 */
export function formatBettingPercentages(line: BettingLine): string {
  const sharp = detectSharpMoney(line);
  
  let result = "";
  
  if (line.type === "spread" && line.line !== undefined) {
    const spreadDisplay = line.line >= 0 ? `+${line.line}` : `${line.line}`;
    result += `**SPREAD (${line.sideA.team} ${spreadDisplay}):**\n`;
  } else if (line.type === "total" && line.line !== undefined) {
    result += `**TOTAL (${line.line}):**\n`;
  } else if (line.type === "moneyline") {
    result += `**MONEYLINE:**\n`;
  }
  
  if (line.type === "total") {
    result += `├─ Bets: ${line.sideA.betsPercent}% Over | ${line.sideB.betsPercent}% Under\n`;
    result += `├─ Money: ${line.sideA.moneyPercent}% Over | ${line.sideB.moneyPercent}% Under\n`;
  } else {
    result += `├─ Bets: ${line.sideA.betsPercent}% ${line.sideA.team} | ${line.sideB.betsPercent}% ${line.sideB.team}\n`;
    result += `├─ Money: ${line.sideA.moneyPercent}% ${line.sideA.team} | ${line.sideB.moneyPercent}% ${line.sideB.team}\n`;
  }
  
  if (sharp.isSharp) {
    result += `└─ 🔥 ${sharp.description}\n`;
  } else {
    result += `└─ ${sharp.description}\n`;
  }
  
  return result;
}

/**
 * Parse betting percentages from text (for processing web search results)
 */
export function parseBettingPercentages(text: string): {
  spread?: BettingLine;
  total?: BettingLine;
  moneyline?: BettingLine;
} | null {
  const result: {
    spread?: BettingLine;
    total?: BettingLine;
    moneyline?: BettingLine;
  } = {};
  
  // Try to extract spread percentages
  const spreadMatch = text.match(/spread[:\s]*(\d+)%?\s*[-|/]\s*(\d+)%?/i);
  if (spreadMatch) {
    result.spread = {
      type: "spread",
      sideA: { team: "Home", betsPercent: parseInt(spreadMatch[1]), moneyPercent: parseInt(spreadMatch[1]) },
      sideB: { team: "Away", betsPercent: parseInt(spreadMatch[2]), moneyPercent: parseInt(spreadMatch[2]) }
    };
  }
  
  // Try to extract over/under percentages
  const totalMatch = text.match(/over[:\s]*(\d+)%?\s*[-|/]?\s*under[:\s]*(\d+)%?/i);
  if (totalMatch) {
    result.total = {
      type: "total",
      sideA: { team: "Over", betsPercent: parseInt(totalMatch[1]), moneyPercent: parseInt(totalMatch[1]) },
      sideB: { team: "Under", betsPercent: parseInt(totalMatch[2]), moneyPercent: parseInt(totalMatch[2]) }
    };
  }
  
  // Try to extract moneyline percentages
  const mlMatch = text.match(/moneyline[:\s]*(\d+)%?\s*[-|/]\s*(\d+)%?/i);
  if (mlMatch) {
    result.moneyline = {
      type: "moneyline",
      sideA: { team: "Favorite", betsPercent: parseInt(mlMatch[1]), moneyPercent: parseInt(mlMatch[1]) },
      sideB: { team: "Underdog", betsPercent: parseInt(mlMatch[2]), moneyPercent: parseInt(mlMatch[2]) }
    };
  }
  
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Determine public side (side with more bets)
 */
export function getPublicSide(line: BettingLine): "sideA" | "sideB" {
  return line.sideA.betsPercent > line.sideB.betsPercent ? "sideA" : "sideB";
}

/**
 * Generate a summary of sharp vs public action for a game
 */
export function generateSharpSummary(lines: BettingLine[]): string {
  const sharpIndicators = lines.map(line => ({
    line,
    sharp: detectSharpMoney(line)
  }));
  
  const sharpCount = sharpIndicators.filter(s => s.sharp.isSharp).length;
  
  if (sharpCount === 0) {
    return "📊 No significant sharp/public split detected - action appears balanced.";
  }
  
  const summaries = sharpIndicators
    .filter(s => s.sharp.isSharp)
    .map(s => `${s.line.type}: ${s.sharp.description}`);
  
  return `🔥 Sharp action detected on ${sharpCount} market(s):\n${summaries.join("\n")}`;
}
