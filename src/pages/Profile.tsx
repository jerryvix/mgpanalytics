import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogOut, Shield, Clock, CreditCard, Loader2 } from "lucide-react";
import { User } from "@supabase/supabase-js";

const Profile = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showPasswordReset = searchParams.get("reset") === "true";

  const { isInTrial, trialEndsAt, daysRemaining, loading: trialLoading } = useTrialStatus();

  const [user, setUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error signing out");
    } else {
      toast.success("LOGGED OUT", { description: "Session terminated" });
      navigate("/");
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("PASSWORD UPDATED", { description: "Your password has been changed." });
      setNewPassword("");
      setConfirmPassword("");
      setSearchParams({});
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setPasswordLoading(false);
    }
  };

  const trialPercentRemaining = trialEndsAt
    ? Math.max(0, Math.min(100, (daysRemaining / 14) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold font-mono text-terminal-green glow-green tracking-wider mb-6">
          PROFILE
        </h1>

        <div className="space-y-6">
          {/* Account */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <Shield className="h-5 w-5 text-terminal-green" />
                Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Email
                </Label>
                <p className="text-sm font-mono text-foreground mt-1">
                  {user?.email || "Loading..."}
                </p>
              </div>
              <div>
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Member Since
                </Label>
                <p className="text-sm font-mono text-foreground mt-1">
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString("en-US", {
                        year: "numeric", month: "long", day: "numeric",
                      })
                    : "—"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="font-mono text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-3 w-3 mr-2" />
                SIGN OUT
              </Button>
            </CardContent>
          </Card>

          {/* Trial Status */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <Clock className="h-5 w-5 text-terminal-green" />
                Trial Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {trialLoading ? (
                <div className="text-sm font-mono text-muted-foreground">Loading...</div>
              ) : isInTrial ? (
                <>
                  <div className="flex items-center justify-between text-sm font-mono">
                    <span className="text-terminal-green">{daysRemaining} days remaining</span>
                    <span className="text-muted-foreground">
                      Ends {trialEndsAt?.toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-terminal-green rounded-full transition-all"
                      style={{ width: `${trialPercentRemaining}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-sm font-mono text-amber-500">
                  Trial period has ended. Subscribe for continued access.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Password Update (conditional) */}
          {showPasswordReset && (
            <Card className="border-terminal-green/30 bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-mono text-terminal-green">
                  UPDATE PASSWORD
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                      New Password
                    </Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="font-mono bg-input border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                      Confirm Password
                    </Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="font-mono bg-input border-border"
                    />
                  </div>
                  <Button type="submit" className="font-mono tracking-wider" disabled={passwordLoading}>
                    {passwordLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        UPDATING...
                      </>
                    ) : (
                      "UPDATE PASSWORD \u2192"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Subscription */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-terminal-green" />
                Subscription
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-mono text-muted-foreground">
                BILLING COMING SOON
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Subscription management and billing options will be available in a future update.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;
