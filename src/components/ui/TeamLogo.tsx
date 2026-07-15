import { useState } from "react";
import { getTeamAbbrev } from "@/utils/teamAbbreviations";

interface TeamLogoProps {
  sport: string;
  name: string;
  abbr?: string;
  espnId?: string | number | null; // ESPN team id (college tables carry it)
  size?: number;
  className?: string;
}

// Resolves a real team logo where we can, and always falls back to a clean
// colored monogram so every team looks polished — no broken images, ever.
function logoUrl(sport: string, name: string, abbr?: string, espnId?: string | number | null): string | null {
  const s = (sport || "").toUpperCase();
  if (s === "NCAAF" || s === "NCAAB") {
    return espnId ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png` : null;
  }
  if (s === "NFL" || s === "NBA" || s === "MLB") {
    const a = (abbr || getTeamAbbrev(name, s) || "").toLowerCase();
    if (!a || a.length > 4) return null;
    return `https://a.espncdn.com/i/teamlogos/${s.toLowerCase()}/500/${a}.png`;
  }
  return null;
}

// Deterministic, pleasant color from the team name for the monogram fallback.
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 32%)`;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function TeamLogo({ sport, name, abbr, espnId, size = 24, className }: TeamLogoProps) {
  const [failed, setFailed] = useState(false);
  const url = logoUrl(sport, name, abbr, espnId);
  const px = { width: size, height: size };

  if (!url || failed) {
    return (
      <span
        aria-label={name}
        title={name}
        className={`inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 ${className ?? ""}`}
        style={{ ...px, backgroundColor: colorFor(name), fontSize: size * 0.4 }}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={name}
      title={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-contain shrink-0 ${className ?? ""}`}
      style={px}
    />
  );
}
