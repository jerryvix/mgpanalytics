import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";

type AuthMode = "login" | "signup" | "forgot" | "resend";

const emailSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const authSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const MODE_LABELS: Record<AuthMode, { title: string; description: string; button: string }> = {
  login: { title: "AUTHENTICATE", description: "Enter credentials to access the terminal", button: "LOGIN \u2192" },
  signup: { title: "CREATE ACCOUNT", description: "Register for terminal access", button: "REGISTER \u2192" },
  forgot: { title: "RESET PASSWORD", description: "Enter your email to receive a reset link", button: "SEND RESET LINK \u2192" },
  resend: { title: "RESEND CONFIRMATION", description: "Enter your email to resend the verification link", button: "RESEND \u2192" },
};

export function AuthCard() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const needsPassword = mode === "login" || mode === "signup";
  const labels = MODE_LABELS[mode];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate input
    if (needsPassword) {
      const result = authSchema.safeParse({ email, password });
      if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        toast.error(errors.email?.[0] || errors.password?.[0] || "Invalid input");
        setLoading(false);
        return;
      }
    } else {
      const result = emailSchema.safeParse({ email });
      if (!result.success) {
        toast.error(result.error.flatten().fieldErrors.email?.[0] || "Invalid email");
        setLoading(false);
        return;
      }
    }

    try {
      switch (mode) {
        case "login": {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) {
            if (error.message.includes("Email not confirmed")) {
              toast.error("EMAIL NOT VERIFIED", {
                description: "Check your inbox for the verification link.",
                action: {
                  label: "RESEND",
                  onClick: () => { setMode("resend"); },
                },
              });
              setLoading(false);
              return;
            }
            throw error;
          }
          toast.success("ACCESS GRANTED", { description: "Redirecting to dashboard..." });
          break;
        }
        case "signup": {
          const redirectUrl = `${window.location.origin}/auth/callback`;
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: redirectUrl },
          });
          if (error) throw error;

          // Supabase returns identities:[] for existing emails without error
          if (data.user?.identities?.length === 0) {
            toast.error("ACCOUNT ALREADY EXISTS", {
              description: "Try signing in, or use 'Resend Verification' below.",
              action: {
                label: "RESEND",
                onClick: () => { setMode("resend"); },
              },
            });
            setMode("login");
            setLoading(false);
            return;
          }

          toast.success("ACCOUNT CREATED", {
            description: "Check your email to verify your account, then sign in.",
          });
          setMode("login");
          break;
        }
        case "forgot": {
          const redirectUrl = `${window.location.origin}/auth/callback`;
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl,
          });
          if (error) throw error;
          toast.success("PASSWORD RESET SENT", {
            description: "Check your email for the reset link.",
          });
          setMode("login");
          break;
        }
        case "resend": {
          const { error } = await supabase.auth.resend({ type: "signup", email });
          if (error) throw error;
          toast.success("CONFIRMATION RESENT", {
            description: "Check your email for the verification link.",
          });
          setMode("login");
          break;
        }
      }
    } catch (error: any) {
      let message = error.message;
      if (message.includes("Invalid login credentials")) {
        message = "INVALID CREDENTIALS";
      } else if (message.includes("User already registered")) {
        message = "USER ALREADY EXISTS";
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-[380px] border-border bg-card border-glow">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl font-mono tracking-wide text-foreground">
          {labels.title}
        </CardTitle>
        <CardDescription className="text-muted-foreground font-mono text-xs">
          {labels.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          type="button"
          className="w-full font-mono tracking-wider mb-4 border-border hover:border-primary"
          onClick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo: `${window.location.origin}/auth/callback`,
              },
            });
            if (error) toast.error(error.message);
          }}
        >
          <img src="/logos/google.svg" className="w-4 h-4 mr-2" alt="" />
          CONTINUE WITH GOOGLE
        </Button>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground font-mono">OR</span>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="operator@mgp.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="font-mono bg-input border-border focus:border-primary focus:ring-primary/30"
            />
          </div>
          {needsPassword && (
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="font-mono bg-input border-border focus:border-primary focus:ring-primary/30"
              />
            </div>
          )}
          <Button
            type="submit"
            className="w-full font-mono tracking-wider"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                PROCESSING...
              </>
            ) : (
              labels.button
            )}
          </Button>
        </form>
        <div className="mt-4 text-center space-y-2">
          {mode === "login" && (
            <>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="block w-full text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
              >
                [ NEW USER? CREATE ACCOUNT ]
              </button>
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="block w-full text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
              >
                [ FORGOT PASSWORD? ]
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              <button
                type="button"
                onClick={() => setMode("login")}
                className="block w-full text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
              >
                [ EXISTING USER? SIGN IN ]
              </button>
              <button
                type="button"
                onClick={() => setMode("resend")}
                className="block w-full text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
              >
                [ RESEND CONFIRMATION EMAIL ]
              </button>
            </>
          )}
          {(mode === "forgot" || mode === "resend") && (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="block w-full text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
            >
              [ BACK TO SIGN IN ]
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
