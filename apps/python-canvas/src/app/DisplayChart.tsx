import { useState } from "react";
import type { DisplayChart as Chart } from "./displayOutput";

const numberLabel = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

export function DisplayChart({ panel }: { panel: Chart }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = panel.series.filter((line) => !hidden.has(line.label));
  const points = panel.series.flatMap((line) => line.points);
  if (points.length === 0)
    return <p>No measurements were produced in this run.</p>;
  const minX = points.reduce((min, [x]) => Math.min(min, x), Infinity);
  const maxX = points.reduce((max, [x]) => Math.max(max, x), minX + 1);
  const minY = points.reduce((min, [, y]) => Math.min(min, y), 0);
  const maxY = points.reduce((max, [, y]) => Math.max(max, y), minY + 1);
  const x = (value: number) => 58 + ((value - minX) / (maxX - minX)) * 540;
  const y = (value: number) => 260 - ((value - minY) / (maxY - minY)) * 230;
  return (
    <div className="python-canvas-chart">
      <div className="python-canvas-chart-legend" aria-label="Chart series">
        {panel.series.map((line) => (
          <button
            type="button"
            key={line.label}
            aria-pressed={!hidden.has(line.label)}
            onClick={() =>
              setHidden((current) => {
                const next = new Set(current);
                if (next.has(line.label)) next.delete(line.label);
                else next.add(line.label);
                return next;
              })
            }
          >
            <span style={{ background: line.color }} />
            {line.label}
          </button>
        ))}
      </div>
      <svg
        viewBox="0 0 640 320"
        role="img"
        aria-label={`${panel.title}. ${panel.yLabel} by ${panel.xLabel}. Toggle series above; hover a point for its value.`}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const value = minY + ((maxY - minY) * i) / 4;
          return (
            <g key={i}>
              <line
                x1="58"
                x2="598"
                y1={y(value)}
                y2={y(value)}
                className="chart-grid"
              />
              <text x="47" y={y(value) + 4} textAnchor="end">
                {numberLabel(value)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: 5 }, (_, i) => {
          const value = minX + ((maxX - minX) * i) / 4;
          return (
            <text key={i} x={x(value)} y="282" textAnchor="middle">
              {numberLabel(value)}
            </text>
          );
        })}
        {visible.map((line) => (
          <g key={line.label}>
            <polyline
              fill="none"
              stroke={line.color}
              strokeWidth="3"
              strokeLinejoin="round"
              points={line.points
                .map(([px, py]) => `${String(x(px))},${String(y(py))}`)
                .join(" ")}
            />
            {line.points.map(([px, py], i) => (
              <circle key={i} cx={x(px)} cy={y(py)} r="4" fill={line.color}>
                <title>{`${line.label}: ${numberLabel(px)} ${panel.xLabel}, ${numberLabel(py)} ${panel.yLabel}`}</title>
              </circle>
            ))}
          </g>
        ))}
        <text x="330" y="310" textAnchor="middle">
          {panel.xLabel}
        </text>
        <text x="58" y="16">
          {panel.yLabel}
        </text>
      </svg>
    </div>
  );
}
