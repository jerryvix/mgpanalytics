import { Routes, Route, Navigate } from "react-router-dom";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { NFLSlate } from "@/components/dashboard/NFLSlate";
import { NBASlate } from "@/components/dashboard/NBASlate";
import { NCAABSlate } from "@/components/dashboard/NCAABSlate";
import { AdminPanel } from "@/components/dashboard/AdminPanel";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import Analyst from "@/pages/Analyst";
import NFLPlayers from "@/pages/NFLPlayers";
import NFLPlayerDetail from "@/pages/NFLPlayerDetail";
import NBAPlayers from "@/pages/NBAPlayers";
import NCAABPlayers from "@/pages/NCAABPlayers";
import PlayerProfile from "@/pages/PlayerProfile";

interface DashboardContentProps {
  isAdmin: boolean;
}

export function DashboardContent({ isAdmin }: DashboardContentProps) {
  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      <Routes>
        <Route index element={<DashboardHome />} />
        <Route path="analyst" element={<Analyst />} />
        <Route path="nfl" element={<NFLSlate />} />
        <Route path="nfl/players" element={<NFLPlayers />} />
        <Route path="nfl/players/bdl-:playerId" element={<NFLPlayerDetail />} />
        <Route path="nfl/players/:playerId" element={<PlayerProfile />} />
        <Route path="nba" element={<NBASlate />} />
        <Route path="nba/players" element={<NBAPlayers />} />
        <Route path="nba/players/:playerId" element={<PlayerProfile />} />
        <Route path="mlb" element={<ComingSoon sport="MLB" emoji="⚾" />} />
        <Route path="ncaaf" element={<ComingSoon sport="NCAAF" emoji="🏈" />} />
        <Route path="ncaab" element={<NCAABSlate />} />
        <Route path="ncaab/players" element={<NCAABPlayers />} />
        <Route path="ncaab/players/:playerId" element={<PlayerProfile />} />
        <Route 
          path="admin" 
          element={isAdmin ? <AdminPanel /> : <Navigate to="/dashboard" replace />} 
        />
      </Routes>
    </div>
  );
}
