import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthCard } from "@/components/AuthCard";
import { motion } from "framer-motion";

const Index = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/dashboard");
      }
      setLoading(false);
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          navigate("/dashboard");
        }
      }
    );

    checkSession();

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-terminal-green glow-green animate-pulse-glow font-mono">
          INITIALIZING...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated scan line effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-terminal-green/20 to-transparent animate-scan" />
      </div>

      {/* Grid background pattern */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--terminal-green) / 0.1) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--terminal-green) / 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        {/* Logo and Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 text-center"
        >
          <h1 className="text-5xl md:text-6xl font-bold text-terminal-green glow-green tracking-wider mb-2">
            MGP
          </h1>
          <p className="text-muted-foreground font-mono text-sm tracking-widest uppercase">
            Sports Analytics Terminal
          </p>
        </motion.div>

        {/* Value prop — a cold visitor should get what MGP is in one glance.
            Benefit headline (no category labels, no analogies — the Bloomberg
            framing stays in investor collateral), platforms named for instant
            recognition and breadth. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="mb-7 max-w-xl text-center"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3 text-balance">
            Get an edge on the books.
          </h2>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            Live odds. Line moves. Hot streaks. One screen.
          </p>
        </motion.div>

        {/* Status bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="mb-6 flex items-center gap-4 text-xs font-mono text-muted-foreground"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-terminal-green animate-pulse-glow" />
            SYSTEM ONLINE
          </span>
          <span className="text-border">|</span>
          <span>NFL • MLB • NBA • NCAAF • NCAAB</span>
          <span className="text-border">|</span>
          <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()}</span>
        </motion.div>

        {/* Auth Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <AuthCard />
        </motion.div>

        {/* Why MGP link — off the hero path, for the curious cold visitor */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65, duration: 0.4 }}
          className="mt-4"
        >
          <Link
            to="/why"
            className="text-xs font-mono text-muted-foreground hover:text-terminal-green transition-colors"
          >
            [ WHY MGP → ]
          </Link>
        </motion.div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="absolute bottom-4 text-center text-xs font-mono text-muted-foreground/50"
        >
          <p>
            © 2026 MGP ANALYTICS • ALL RIGHTS RESERVED •{" "}
            <Link to="/why" className="hover:text-terminal-green transition-colors">
              WHY MGP
            </Link>
          </p>
        </motion.footer>
      </div>
    </div>
  );
};

export default Index;
