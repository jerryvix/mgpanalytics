import { motion } from "framer-motion";
import { Activity, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  {
    label: "Active Markets",
    value: "24",
    change: "+3",
    trend: "up",
    icon: Activity,
  },
  {
    label: "NFL Lines",
    value: "16",
    change: "+2",
    trend: "up",
    icon: TrendingUp,
  },
  {
    label: "NBA Lines",
    value: "12",
    change: "-1",
    trend: "down",
    icon: TrendingDown,
  },
  {
    label: "Next Update",
    value: "5:32",
    change: "min",
    trend: "neutral",
    icon: Clock,
  },
];

export function DashboardHome() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide">
            DASHBOARD
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Real-time sports analytics overview
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-terminal-green animate-pulse-glow" />
            LIVE
          </span>
          <span className="text-border">|</span>
          <span>{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="bg-card border-border hover:border-primary/30 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </CardTitle>
                <stat.icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-foreground">
                    {stat.value}
                  </span>
                  <span className={`text-xs font-mono ${
                    stat.trend === "up" 
                      ? "text-terminal-green" 
                      : stat.trend === "down" 
                        ? "text-terminal-red" 
                        : "text-muted-foreground"
                  }`}>
                    {stat.change}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Terminal Output */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              System Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-xs space-y-1 text-muted-foreground">
              <p><span className="text-terminal-green">[OK]</span> Connection established to data feed</p>
              <p><span className="text-terminal-green">[OK]</span> NFL odds synchronized</p>
              <p><span className="text-terminal-green">[OK]</span> NBA odds synchronized</p>
              <p><span className="text-terminal-amber">[INFO]</span> Next refresh in 5 minutes</p>
              <p className="text-foreground cursor-blink">_</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
