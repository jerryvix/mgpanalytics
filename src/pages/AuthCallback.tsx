import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          navigate("/dashboard/profile?reset=true", { replace: true });
        } else if (event === "SIGNED_IN" && session) {
          navigate("/dashboard", { replace: true });
        }
      }
    );

    // Timeout — if nothing happens in 5s, show error
    const timeout = setTimeout(() => {
      setError("Authentication timed out. The link may have expired.");
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-destructive font-mono text-sm">{error}</div>
          <button
            onClick={() => navigate("/")}
            className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
          >
            [ RETURN TO LOGIN ]
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-terminal-green glow-green animate-pulse-glow font-mono">
        AUTHENTICATING...
      </div>
    </div>
  );
};

export default AuthCallback;
