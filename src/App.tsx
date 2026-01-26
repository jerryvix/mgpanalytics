import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import CappersDirectory from "./pages/CappersDirectory";
import { 
  SharpsPage, 
  AnalystsPage, 
  PropsPage, 
  PopCulturePage, 
  MediaPage, 
  InsidersPage,
  CapperProfilePage 
} from "./pages/cappers";
import { FeedPage } from "./pages/community";
import NotFound from "./pages/NotFound";
import { ChatProvider } from "./contexts/ChatContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ChatProvider>
        <Toaster />
        <Sonner 
          theme="dark"
          toastOptions={{
            classNames: {
              toast: "bg-card border-border font-mono",
              title: "text-foreground",
              description: "text-muted-foreground",
            },
          }}
        />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard/*" element={<Dashboard />} />
            {/* Community Routes */}
            <Route path="/community/feed" element={<FeedPage />} />
            <Route path="/community/cappers" element={<CappersDirectory />} />
            <Route path="/community/cappers/sharps" element={<SharpsPage />} />
            <Route path="/community/cappers/analysts" element={<AnalystsPage />} />
            <Route path="/community/cappers/props" element={<PropsPage />} />
            <Route path="/community/cappers/pop-culture" element={<PopCulturePage />} />
            <Route path="/community/cappers/media" element={<MediaPage />} />
            <Route path="/community/cappers/insiders" element={<InsidersPage />} />
            <Route path="/community/cappers/:username" element={<CapperProfilePage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ChatProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
