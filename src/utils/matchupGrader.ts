// Matchup Grader for Props Analysis
// Grades prop bets based on advanced stats, trends, and matchup data

export type PropType = "passing_yards" | "rushing_yards" | "receiving_yards" | 
                       "receptions" | "pass_td" | "rush_td" | "rec_td" | "fantasy";

export type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D+" | "D" | "D-" | "F";

export interface PropContext {
  playerName: string;
  propType: PropType;
  line: number;
  position: string;
  seasonAvg: number;
  last5Avg: number;
  last5HitRate: number; // 0-1, percentage that hit over
  advancedStats: {
    epa?: number;
    targetShare?: number;
    airYardsShare?: number;
    catchRate?: number;
    yardsAfterContact?: number;
    explosiveRate?: number;
    snapShare?: number;
    pressureRate?: number;
  };
  matchup?: {
    opponentRank: number; // 1-32, 1 is worst defense
    opponentAvgAllowed: number;
    opponentLast3Avg: number;
  };
  situational?: {
    isHomeGame?: boolean;
    isDome?: boolean;
    weatherConcern?: boolean;
    isPlayoffImplication?: boolean;
  };
}

export interface GradingResult {
  grade: Grade;
  gradeNumeric: number; // 0-100
  favorableFactors: string[];
  concernFactors: string[];
  summary: string;
  confidence: "high" | "medium" | "low";
}

// Grade numeric values
const GRADE_VALUES: Record<Grade, number> = {
  "A+": 97, "A": 93, "A-": 90,
  "B+": 87, "B": 83, "B-": 80,
  "C+": 77, "C": 73, "C-": 70,
  "D+": 67, "D": 63, "D-": 60,
  "F": 50
};

function numericToGrade(value: number): Grade {
  if (value >= 95) return "A+";
  if (value >= 90) return "A";
  if (value >= 87) return "A-";
  if (value >= 83) return "B+";
  if (value >= 80) return "B";
  if (value >= 77) return "B-";
  if (value >= 73) return "C+";
  if (value >= 70) return "C";
  if (value >= 67) return "C-";
  if (value >= 63) return "D+";
  if (value >= 60) return "D";
  if (value >= 55) return "D-";
  return "F";
}

// Grade passing yards prop
function gradePassingYards(ctx: PropContext): GradingResult {
  const favorable: string[] = [];
  const concerns: string[] = [];
  let score = 50; // Start neutral

  // Season average vs line
  const avgVsLine = ctx.seasonAvg - ctx.line;
  if (avgVsLine > 20) {
    score += 15;
    favorable.push(`Season average (${ctx.seasonAvg.toFixed(1)}) exceeds line by ${avgVsLine.toFixed(1)} yards`);
  } else if (avgVsLine > 0) {
    score += 8;
    favorable.push(`Season average (${ctx.seasonAvg.toFixed(1)}) is above the line`);
  } else if (avgVsLine < -20) {
    score -= 15;
    concerns.push(`Season average (${ctx.seasonAvg.toFixed(1)}) is ${Math.abs(avgVsLine).toFixed(1)} yards below line`);
  } else if (avgVsLine < 0) {
    score -= 8;
    concerns.push(`Season average slightly below line`);
  }

  // Recent form (last 5)
  if (ctx.last5HitRate >= 0.8) {
    score += 12;
    favorable.push(`Hit this line in ${Math.round(ctx.last5HitRate * 5)}/5 recent games`);
  } else if (ctx.last5HitRate >= 0.6) {
    score += 6;
    favorable.push(`Hit this line in ${Math.round(ctx.last5HitRate * 5)}/5 recent games`);
  } else if (ctx.last5HitRate <= 0.2) {
    score -= 12;
    concerns.push(`Only hit this line ${Math.round(ctx.last5HitRate * 5)}/5 recent games`);
  }

  // Air yards (for QBs)
  if (ctx.advancedStats.airYardsShare && ctx.advancedStats.airYardsShare > 8) {
    score += 8;
    favorable.push(`High air yards per attempt suggests downfield opportunities`);
  }

  // Pressure rate (lower is better for passing)
  if (ctx.advancedStats.pressureRate !== undefined) {
    if (ctx.advancedStats.pressureRate < 28) {
      score += 6;
      favorable.push(`Low pressure rate (${ctx.advancedStats.pressureRate.toFixed(1)}%) indicates clean pocket`);
    } else if (ctx.advancedStats.pressureRate > 35) {
      score -= 8;
      concerns.push(`High pressure rate (${ctx.advancedStats.pressureRate.toFixed(1)}%) could limit production`);
    }
  }

  // Matchup
  if (ctx.matchup) {
    if (ctx.matchup.opponentRank <= 10) {
      score += 10;
      favorable.push(`Favorable matchup: Defense ranks ${ctx.matchup.opponentRank}th vs pass`);
    } else if (ctx.matchup.opponentRank >= 25) {
      score -= 10;
      concerns.push(`Tough matchup: Defense ranks ${ctx.matchup.opponentRank}th vs pass`);
    }

    if (ctx.matchup.opponentAvgAllowed > ctx.line) {
      score += 5;
      favorable.push(`Defense allows ${ctx.matchup.opponentAvgAllowed.toFixed(1)} pass yds/game (above line)`);
    }
  }

  // Situational
  if (ctx.situational) {
    if (ctx.situational.isDome) {
      score += 3;
      favorable.push(`Indoor/dome game eliminates weather factors`);
    }
    if (ctx.situational.weatherConcern) {
      score -= 8;
      concerns.push(`Weather conditions could impact passing game`);
    }
  }

  // Cap score
  score = Math.max(30, Math.min(99, score));

  return {
    grade: numericToGrade(score),
    gradeNumeric: score,
    favorableFactors: favorable,
    concernFactors: concerns,
    summary: generateSummary("passing yards", score, favorable.length, concerns.length),
    confidence: score >= 80 || score <= 40 ? "high" : "medium"
  };
}

// Grade rushing yards prop
function gradeRushingYards(ctx: PropContext): GradingResult {
  const favorable: string[] = [];
  const concerns: string[] = [];
  let score = 50;

  // Season average vs line
  const avgVsLine = ctx.seasonAvg - ctx.line;
  if (avgVsLine > 15) {
    score += 15;
    favorable.push(`Season average (${ctx.seasonAvg.toFixed(1)}) exceeds line by ${avgVsLine.toFixed(1)} yards`);
  } else if (avgVsLine > 0) {
    score += 8;
  } else if (avgVsLine < -15) {
    score -= 15;
    concerns.push(`Season average well below line`);
  }

  // Recent form
  if (ctx.last5HitRate >= 0.8) {
    score += 12;
    favorable.push(`Hit this line in ${Math.round(ctx.last5HitRate * 5)}/5 recent games`);
  } else if (ctx.last5HitRate <= 0.2) {
    score -= 12;
    concerns.push(`Rarely hits this line recently`);
  }

  // Yards after contact
  if (ctx.advancedStats.yardsAfterContact) {
    if (ctx.advancedStats.yardsAfterContact > 3.2) {
      score += 8;
      favorable.push(`Strong yards after contact (${ctx.advancedStats.yardsAfterContact.toFixed(1)}) shows power`);
    } else if (ctx.advancedStats.yardsAfterContact < 2.2) {
      score -= 5;
      concerns.push(`Low yards after contact limits ceiling`);
    }
  }

  // Explosive run rate
  if (ctx.advancedStats.explosiveRate) {
    if (ctx.advancedStats.explosiveRate > 14) {
      score += 7;
      favorable.push(`High explosive run rate (${ctx.advancedStats.explosiveRate.toFixed(1)}%) for big play potential`);
    }
  }

  // Snap share
  if (ctx.advancedStats.snapShare) {
    if (ctx.advancedStats.snapShare > 65) {
      score += 8;
      favorable.push(`Dominant snap share (${ctx.advancedStats.snapShare.toFixed(1)}%) ensures volume`);
    } else if (ctx.advancedStats.snapShare < 45) {
      score -= 10;
      concerns.push(`Limited snap share (${ctx.advancedStats.snapShare.toFixed(1)}%) caps opportunity`);
    }
  }

  // Matchup
  if (ctx.matchup) {
    if (ctx.matchup.opponentRank <= 10) {
      score += 10;
      favorable.push(`Favorable matchup: Defense ranks ${ctx.matchup.opponentRank}th vs run`);
    } else if (ctx.matchup.opponentRank >= 25) {
      score -= 10;
      concerns.push(`Tough matchup: Defense ranks ${ctx.matchup.opponentRank}th vs run`);
    }
  }

  score = Math.max(30, Math.min(99, score));

  return {
    grade: numericToGrade(score),
    gradeNumeric: score,
    favorableFactors: favorable,
    concernFactors: concerns,
    summary: generateSummary("rushing yards", score, favorable.length, concerns.length),
    confidence: score >= 80 || score <= 40 ? "high" : "medium"
  };
}

// Grade receiving yards prop
function gradeReceivingYards(ctx: PropContext): GradingResult {
  const favorable: string[] = [];
  const concerns: string[] = [];
  let score = 50;

  // Season average vs line
  const avgVsLine = ctx.seasonAvg - ctx.line;
  if (avgVsLine > 15) {
    score += 15;
    favorable.push(`Season average (${ctx.seasonAvg.toFixed(1)}) exceeds line`);
  } else if (avgVsLine > 0) {
    score += 8;
  } else if (avgVsLine < -15) {
    score -= 15;
    concerns.push(`Season average below line`);
  }

  // Recent form
  if (ctx.last5HitRate >= 0.8) {
    score += 12;
    favorable.push(`Hit this line in ${Math.round(ctx.last5HitRate * 5)}/5 recent games`);
  } else if (ctx.last5HitRate <= 0.2) {
    score -= 12;
    concerns.push(`Rarely hits this line recently`);
  }

  // Target share
  if (ctx.advancedStats.targetShare) {
    if (ctx.advancedStats.targetShare > 25) {
      score += 10;
      favorable.push(`Elite target share (${ctx.advancedStats.targetShare.toFixed(1)}%) ensures volume`);
    } else if (ctx.advancedStats.targetShare > 20) {
      score += 5;
      favorable.push(`Strong target share (${ctx.advancedStats.targetShare.toFixed(1)}%)`);
    } else if (ctx.advancedStats.targetShare < 12) {
      score -= 8;
      concerns.push(`Low target share limits opportunities`);
    }
  }

  // Catch rate
  if (ctx.advancedStats.catchRate) {
    if (ctx.advancedStats.catchRate > 72) {
      score += 6;
      favorable.push(`High catch rate (${ctx.advancedStats.catchRate.toFixed(1)}%) converts targets efficiently`);
    } else if (ctx.advancedStats.catchRate < 58) {
      score -= 6;
      concerns.push(`Low catch rate could waste targets`);
    }
  }

  // Air yards share
  if (ctx.advancedStats.airYardsShare) {
    if (ctx.advancedStats.airYardsShare > 28) {
      score += 7;
      favorable.push(`High air yards share (${ctx.advancedStats.airYardsShare.toFixed(1)}%) indicates downfield usage`);
    }
  }

  // Matchup
  if (ctx.matchup) {
    if (ctx.matchup.opponentRank <= 10) {
      score += 10;
      favorable.push(`Favorable matchup vs ${ctx.matchup.opponentRank}th ranked pass defense`);
    } else if (ctx.matchup.opponentRank >= 25) {
      score -= 10;
      concerns.push(`Tough matchup vs ${ctx.matchup.opponentRank}th ranked pass defense`);
    }
  }

  score = Math.max(30, Math.min(99, score));

  return {
    grade: numericToGrade(score),
    gradeNumeric: score,
    favorableFactors: favorable,
    concernFactors: concerns,
    summary: generateSummary("receiving yards", score, favorable.length, concerns.length),
    confidence: score >= 80 || score <= 40 ? "high" : "medium"
  };
}

// Grade receptions prop
function gradeReceptions(ctx: PropContext): GradingResult {
  const favorable: string[] = [];
  const concerns: string[] = [];
  let score = 50;

  const avgVsLine = ctx.seasonAvg - ctx.line;
  if (avgVsLine > 1.5) {
    score += 15;
    favorable.push(`Season average (${ctx.seasonAvg.toFixed(1)}) well above line`);
  } else if (avgVsLine > 0) {
    score += 8;
  } else if (avgVsLine < -1.5) {
    score -= 15;
    concerns.push(`Season average below line`);
  }

  if (ctx.last5HitRate >= 0.8) {
    score += 12;
    favorable.push(`Hit this line in ${Math.round(ctx.last5HitRate * 5)}/5 recent games`);
  }

  if (ctx.advancedStats.targetShare) {
    if (ctx.advancedStats.targetShare > 22) {
      score += 10;
      favorable.push(`High target share ensures opportunities`);
    }
  }

  if (ctx.advancedStats.catchRate) {
    if (ctx.advancedStats.catchRate > 72) {
      score += 8;
      favorable.push(`Excellent catch rate (${ctx.advancedStats.catchRate.toFixed(1)}%)`);
    } else if (ctx.advancedStats.catchRate < 60) {
      score -= 8;
      concerns.push(`Low catch rate could limit conversions`);
    }
  }

  score = Math.max(30, Math.min(99, score));

  return {
    grade: numericToGrade(score),
    gradeNumeric: score,
    favorableFactors: favorable,
    concernFactors: concerns,
    summary: generateSummary("receptions", score, favorable.length, concerns.length),
    confidence: score >= 80 || score <= 40 ? "high" : "medium"
  };
}

function generateSummary(propType: string, score: number, favorableCount: number, concernCount: number): string {
  if (score >= 85) {
    return `Strong alignment between advanced metrics and ${propType} line. Multiple favorable indicators.`;
  } else if (score >= 70) {
    return `Moderate support for this ${propType} prop with ${favorableCount} favorable factor(s).`;
  } else if (score >= 55) {
    return `Mixed signals for this ${propType} prop. Consider additional context.`;
  } else {
    return `Several concerns identified for this ${propType} prop. ${concernCount} factor(s) working against.`;
  }
}

// Main grading function
export function gradeProp(ctx: PropContext): GradingResult {
  switch (ctx.propType) {
    case "passing_yards":
      return gradePassingYards(ctx);
    case "rushing_yards":
      return gradeRushingYards(ctx);
    case "receiving_yards":
      return gradeReceivingYards(ctx);
    case "receptions":
      return gradeReceptions(ctx);
    default:
      // Generic grading for other prop types
      return {
        grade: "C",
        gradeNumeric: 73,
        favorableFactors: [],
        concernFactors: [],
        summary: "Limited data available for this prop type.",
        confidence: "low"
      };
  }
}

// Get grade color class
export function getGradeColor(grade: Grade): string {
  if (grade.startsWith("A")) return "text-green-500";
  if (grade.startsWith("B")) return "text-blue-500";
  if (grade.startsWith("C")) return "text-yellow-500";
  if (grade.startsWith("D")) return "text-orange-500";
  return "text-red-500";
}

export function getGradeBgColor(grade: Grade): string {
  if (grade.startsWith("A")) return "bg-green-500/10 border-green-500/30";
  if (grade.startsWith("B")) return "bg-blue-500/10 border-blue-500/30";
  if (grade.startsWith("C")) return "bg-yellow-500/10 border-yellow-500/30";
  if (grade.startsWith("D")) return "bg-orange-500/10 border-orange-500/30";
  return "bg-red-500/10 border-red-500/30";
}
