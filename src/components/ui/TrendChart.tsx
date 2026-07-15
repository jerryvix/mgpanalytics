// Dependency-free SVG line chart in the terminal aesthetic. Renders a trend
// line with an area fill, optional dashed reference line (e.g. season average),
// and per-point hover titles. Scales to its container width.

export interface TrendPoint {
  label: string; // hover text, e.g. "Jul 3 vs BOS — .312"
  value: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  refValue?: number; // dashed baseline (e.g. season avg)
  refLabel?: string;
  yFmt?: (v: number) => string;
  height?: number;
  className?: string;
}

const W = 600;

export function TrendChart({
  points,
  refValue,
  refLabel,
  yFmt = (v) => v.toFixed(3).replace(/^0/, ""),
  height = 180,
  className,
}: TrendChartProps) {
  if (points.length < 2) return null;

  const H = height;
  const PAD = { top: 14, right: 14, bottom: 18, left: 44 };
  const values = points.map((p) => p.value);
  const allValues = refValue !== undefined ? [...values, refValue] : values;
  let lo = Math.min(...allValues);
  let hi = Math.max(...allValues);
  const span = hi - lo || Math.abs(hi) || 1;
  lo -= span * 0.12;
  hi += span * 0.12;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${(H - PAD.bottom).toFixed(1)} L${PAD.left},${(H - PAD.bottom).toFixed(1)} Z`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full h-auto ${className ?? ""}`} role="img" aria-label="Trend chart">
      {/* y-axis extremes */}
      <text x={PAD.left - 6} y={y(hi) + 10} textAnchor="end" className="fill-muted-foreground" fontSize="11" fontFamily="monospace">
        {yFmt(hi)}
      </text>
      <text x={PAD.left - 6} y={y(lo) - 2} textAnchor="end" className="fill-muted-foreground" fontSize="11" fontFamily="monospace">
        {yFmt(lo)}
      </text>

      {/* reference baseline */}
      {refValue !== undefined && (
        <>
          <line
            x1={PAD.left}
            y1={y(refValue)}
            x2={W - PAD.right}
            y2={y(refValue)}
            className="stroke-muted-foreground/50"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          {refLabel && (
            <text x={W - PAD.right} y={y(refValue) - 4} textAnchor="end" className="fill-muted-foreground" fontSize="10" fontFamily="monospace">
              {refLabel} {yFmt(refValue)}
            </text>
          )}
        </>
      )}

      {/* area + line */}
      <path d={areaPath} className="fill-terminal-green/10" />
      <path d={linePath} className="stroke-terminal-green" fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* points with hover titles */}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4 : 2.5} className="fill-terminal-green">
          <title>{p.label}</title>
        </circle>
      ))}

      {/* latest value callout */}
      <text
        x={Math.min(x(points.length - 1), W - PAD.right - 4)}
        y={Math.max(y(last.value) - 8, 11)}
        textAnchor="end"
        className="fill-terminal-green"
        fontSize="12"
        fontWeight="bold"
        fontFamily="monospace"
      >
        {yFmt(last.value)}
      </text>
    </svg>
  );
}
