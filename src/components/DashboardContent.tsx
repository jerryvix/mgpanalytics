import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import Watchlist from "@/pages/Watchlist";
import SavedChats from "@/pages/SavedChats";
import { NFLSlate } from "@/components/dashboard/NFLSlate";
import { NBASlate } from "@/components/dashboard/NBASlate";
import { NCAABSlate } from "@/components/dashboard/NCAABSlate";
import { NCAAFSlate } from "@/components/dashboard/NCAAFSlate";
import { MLBSlate } from "@/components/dashboard/MLBSlate";
import { TrendingBets } from "@/components/dashboard/TrendingBets";
import { AdminPanel } from "@/components/dashboard/AdminPanel";
import SyncObservatory from "@/pages/SyncObservatory";
import Analyst from "@/pages/Analyst";
import NFLPlayers from "@/pages/NFLPlayers";
import NFLPlayerDetail from "@/pages/NFLPlayerDetail";
import NBAPlayers from "@/pages/NBAPlayers";
// NCAABPlayers removed - no props data available for NCAAB
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
import DashboardNotFound from "@/pages/DashboardNotFound";
import { MobileSportNav } from "@/components/ui/MobileSportNav";
import { BackButton } from "@/components/ui/BackButton";
import { MobileTopBar } from "@/components/ui/MobileTopBar";

interface DashboardContentProps {
  isAdmin: boolean;
}

export function DashboardContent({ isAdmin }: DashboardContentProps) {
  const location = useLocation();
  const isSportsPage = /^\/dashboard\/(nfl|nba|ncaab|ncaaf|mlb)/.test(location.pathname);

  // Phones: the pinned top bar owns the status-bar inset, and the bottom
  // padding clears the floating tab bar plus the home indicator so the last
  // row of every page can scroll fully into view. overflow-x: clip keeps any
  // over-wide child from widening the scroller: a sideways swipe can never
  // drag the pinned bars off screen (clip, unlike hidden, is not a scroll
  // container, so the sticky bars still pin to <main>). Desktop is unchanged.
  return (
    <div className="px-4 pb-[calc(var(--bottom-nav-h)+var(--safe-bottom)+1rem)] max-md:overflow-x-clip md:p-6 md:pb-6 md:pt-6">
      <MobileTopBar subnav={isSportsPage} />
      <BackButton />
      {isSportsPage && <MobileSportNav />}
      <Routes>
        <Route index element={<DashboardHome />} />
        <Route path="analyst" element={<Analyst />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="chats" element={<SavedChats />} />
        <Route path="market/live-edges" element={<ComingSoon sport="Live Edges" emoji="⚡" />} />
        <Route path="market/game-finder" element={<ComingSoon sport="Game Finder" emoji="🔎" />} />
        <Route path="market/line-movement" element={<ComingSoon sport="Line Movement" emoji="📈" />} />
        <Route path="market/props" element={<ComingSoon sport="Player Props" emoji="🎯" />} />
        <Route path="market/trends" element={<ComingSoon sport="Trends" emoji="📊" />} />
        <Route path="nfl" element={<NFLSlate />} />
        <Route path="nfl/players" element={<NFLPlayers />} />
        <Route path="nfl/players/bdl-:playerId" element={<NFLPlayerDetail />} />
        <Route path="nfl/players/:playerId" element={<NFLPlayerDetail />} />
        <Route path="nfl/trending" element={<TrendingBets sport="NFL" />} />
        <Route path="nba" element={<NBASlate />} />
        <Route path="nba/players" element={<NBAPlayers />} />
        <Route path="nba/players/:playerId" element={<NBAPlayerDetailPage />} />
        <Route path="mlb" element={<MLBSlate />} />
        <Route path="mlb/players" element={<MLBPlayers />} />
        <Route path="mlb/players/:playerId" element={<MLBPlayerDetail />} />
        <Route path="mlb/trending" element={<TrendingBets sport="MLB" />} />
        <Route path="ncaaf" element={<NCAAFSlate />} />
        <Route path="ncaaf/trending" element={<TrendingBets sport="NCAAF" />} />
        {/* Legacy path - futures now live under the Games page's Futures tab */}
        <Route path="ncaaf/futures" element={<Navigate to="/dashboard/ncaaf" replace />} />
        <Route path="ncaab" element={<NCAABSlate />} />
        {/* NCAAB players routes removed - no props data available */}
        <Route path="profile" element={<Profile />} />
        {/* Community routes - inside dashboard for sidebar nav */}
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
        {/* Unknown /dashboard/* paths: a Page not found view with Back and
            Home, never a blank screen */}
        <Route path="*" element={<DashboardNotFound />} />
      </Routes>
    </div>
  );
}
