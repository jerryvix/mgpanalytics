import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";

const authSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export function AuthCard() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate input
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const message = errors.email?.[0] || errors.password?.[0] || "Invalid input";
      toast.error(message);
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("ACCESS GRANTED", {
          description: "Redirecting to dashboard...",
        });
      } else {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
          },
        });
        if (error) throw error;
        toast.success("ACCOUNT CREATED", {
          description: "You can now sign in with your credentials.",
        });
        setIsLogin(true);
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
          {isLogin ? "AUTHENTICATE" : "CREATE ACCOUNT"}
        </CardTitle>
        <CardDescription className="text-muted-foreground font-mono text-xs">
          {isLogin 
            ? "Enter credentials to access the terminal" 
            : "Register for terminal access"
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
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
              isLogin ? "LOGIN →" : "REGISTER →"
            )}
          </Button>
        </form>
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
          >
            {isLogin 
              ? "[ NEW USER? CREATE ACCOUNT ]" 
              : "[ EXISTING USER? SIGN IN ]"
            }
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
