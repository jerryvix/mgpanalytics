import { Routes, Route, Navigate } from "react-router-dom";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { NFLSlate } from "@/components/dashboard/NFLSlate";
import { NBASlate } from "@/components/dashboard/NBASlate";
import { AdminPanel } from "@/components/dashboard/AdminPanel";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import Analyst from "@/pages/Analyst";

interface DashboardContentProps {
  isAdmin: boolean;
}

export function DashboardContent({ isAdmin }: DashboardContentProps) {
  return (
    <div className="p-6">
      <Routes>
        <Route index element={<DashboardHome />} />
        <Route path="analyst" element={<Analyst />} />
        <Route path="nfl" element={<NFLSlate />} />
        <Route path="nba" element={<NBASlate />} />
        <Route path="mlb" element={<ComingSoon sport="MLB" emoji="⚾" />} />
        <Route path="ncaaf" element={<ComingSoon sport="NCAAF" emoji="🏈" />} />
        <Route path="ncaab" element={<ComingSoon sport="NCAAB" emoji="🏀" />} />
        <Route 
          path="admin" 
          element={isAdmin ? <AdminPanel /> : <Navigate to="/dashboard" replace />} 
        />
      </Routes>
    </div>
  );
}
