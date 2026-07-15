import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { NFLSlate } from "@/components/dashboard/NFLSlate";
import { NBASlate } from "@/components/dashboard/NBASlate";
import { NCAABSlate } from "@/components/dashboard/NCAABSlate";
import { NCAAFSlate } from "@/components/dashboard/NCAAFSlate";
import { TrendingBets } from "@/components/dashboard/TrendingBets";
import { AdminPanel } from "@/components/dashboard/AdminPanel";
import SyncObservatory from "@/pages/SyncObservatory";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import Analyst from "@/pages/Analyst";
import NFLPlayers from "@/pages/NFLPlayers";
import NFLPlayerDetail from "@/pages/NFLPlayerDetail";
import NBAPlayers from "@/pages/NBAPlayers";
// NCAABPlayers removed — no props data available for NCAAB
// PlayerProfile import removed with NCAAB players routes
import NBAPlayerDetailPage from "@/pages/NBAPlayerDetailPage";
import MLBPlayers from "@/pages/MLBPlayers";
import MLBPlayerDetail from "@/pages/MLBPlayerDetail";
import CappersDirectory from "@/pages/CappersDirectory";
import {
  SharpsPage,
  AnalystsPage,
  PropsPage,
  PopCulturePage,
  MediaPage,
  InsidersPage,
  CapperProfilePage,
} from "@/pages/cappers";
import { FeedPage } from "@/pages/community";
import Profile from "@/pages/Profile";
import { MobileSportNav } from "@/components/ui/MobileSportNav";

interface DashboardContentProps {
  isAdmin: boolean;
}

export function DashboardContent({ isAdmin }: DashboardContentProps) {
  const location = useLocation();
  const isSportsPage = /^\/dashboard\/(nfl|nba|ncaab|ncaaf|mlb)/.test(location.pathname);

  return (
    <div className="p-4 pb-20 md:p-6 md:pb-6">
      {isSportsPage && <MobileSportNav />}
      <Routes>
        <Route index element={<DashboardHome />} />
        <Route path="analyst" element={<Analyst />} />
        <Route path="nfl" element={<NFLSlate />} />
        <Route path="nfl/players" element={<NFLPlayers />} />
        <Route path="nfl/players/bdl-:playerId" element={<NFLPlayerDetail />} />
        <Route path="nfl/players/:playerId" element={<NFLPlayerDetail />} />
        <Route path="nfl/trending" element={<TrendingBets sport="NFL" />} />
        <Route path="nba" element={<NBASlate />} />
        <Route path="nba/players" element={<NBAPlayers />} />
        <Route path="nba/players/:playerId" element={<NBAPlayerDetailPage />} />
        <Route path="mlb" element={<ComingSoon sport="MLB" emoji="⚾" />} />
        <Route path="mlb/players" element={<MLBPlayers />} />
        <Route path="mlb/players/:playerId" element={<MLBPlayerDetail />} />
        <Route path="mlb/trending" element={<TrendingBets sport="MLB" />} />
        <Route path="ncaaf" element={<NCAAFSlate />} />
        <Route path="ncaaf/trending" element={<TrendingBets sport="NCAAF" />} />
        <Route path="ncaab" element={<NCAABSlate />} />
        {/* NCAAB players routes removed — no props data available */}
        <Route path="profile" element={<Profile />} />
        {/* Community routes — inside dashboard for sidebar nav */}
        <Route path="community/feed" element={<FeedPage />} />
        <Route path="community/cappers" element={<CappersDirectory />} />
        <Route path="community/cappers/sharps" element={<SharpsPage />} />
        <Route path="community/cappers/analysts" element={<AnalystsPage />} />
        <Route path="community/cappers/props" element={<PropsPage />} />
        <Route path="community/cappers/pop-culture" element={<PopCulturePage />} />
        <Route path="community/cappers/media" element={<MediaPage />} />
        <Route path="community/cappers/insiders" element={<InsidersPage />} />
        <Route path="community/cappers/:username" element={<CapperProfilePage />} />
        <Route
          path="admin/observatory"
          element={isAdmin ? <SyncObservatory /> : <Navigate to="/dashboard" replace />}
        />
        <Route
          path="admin"
          element={isAdmin ? <AdminPanel /> : <Navigate to="/dashboard" replace />}
        />
      </Routes>
    </div>
  );
}
