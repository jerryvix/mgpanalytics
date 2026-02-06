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
import { MobileLayout } from "./components/MobileLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,   // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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
            {/* Community Routes — wrapped in MobileLayout for bottom nav */}
            <Route path="/community/feed" element={<MobileLayout><FeedPage /></MobileLayout>} />
            <Route path="/community/cappers" element={<MobileLayout><CappersDirectory /></MobileLayout>} />
            <Route path="/community/cappers/sharps" element={<MobileLayout><SharpsPage /></MobileLayout>} />
            <Route path="/community/cappers/analysts" element={<MobileLayout><AnalystsPage /></MobileLayout>} />
            <Route path="/community/cappers/props" element={<MobileLayout><PropsPage /></MobileLayout>} />
            <Route path="/community/cappers/pop-culture" element={<MobileLayout><PopCulturePage /></MobileLayout>} />
            <Route path="/community/cappers/media" element={<MobileLayout><MediaPage /></MobileLayout>} />
            <Route path="/community/cappers/insiders" element={<MobileLayout><InsidersPage /></MobileLayout>} />
            <Route path="/community/cappers/:username" element={<MobileLayout><CapperProfilePage /></MobileLayout>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ChatProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
