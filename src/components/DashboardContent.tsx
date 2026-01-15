import { Routes, Route } from "react-router-dom";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { NFLSlate } from "@/components/dashboard/NFLSlate";
import { NBASlate } from "@/components/dashboard/NBASlate";
import { AdminPanel } from "@/components/dashboard/AdminPanel";

export function DashboardContent() {
  return (
    <div className="p-6">
      <Routes>
        <Route index element={<DashboardHome />} />
        <Route path="nfl" element={<NFLSlate />} />
        <Route path="nba" element={<NBASlate />} />
        <Route path="admin" element={<AdminPanel />} />
      </Routes>
    </div>
  );
}
