import { FileIcon } from "lucide-react";

import { cn } from "@renderer/lib/utils";

import type {
  ArtifactPreviewBlock,
  ArtifactPreviewChartShape,
  ArtifactPreviewStatusTone,
  ArtifactPreviewTextTone,
} from "./artifact-preview-blocks";

/**
 * Draws one artifact's bounded rail preview.
 *
 * The surface deliberately does not mount the catalog's components: a preview
 * carries no tab, accordion, link, copy control, chart tooltip, or file action,
 * and it must not pull Recharts or the OpenUI renderer into the command
 * center's chunk. Its caller owns the fixed content viewport and marks the
 * whole thing inert, so nothing here is focusable or interactive.
 */
export function ArtifactPreviewSurface({ blocks }: { blocks: readonly ArtifactPreviewBlock[] }) {
  return (
    <div className="flex flex-col gap-2 text-xs leading-snug text-foreground">
      {blocks.map((block, index) => (
        <ArtifactPreviewBlockView block={block} key={index} />
      ))}
    </div>
  );
}

const textToneClasses = {
  normal: "text-foreground",
  muted: "text-muted-foreground",
  strong: "font-medium text-foreground",
} satisfies Record<ArtifactPreviewTextTone, string>;

const statusToneClasses = {
  neutral: "border-border text-muted-foreground",
  info: "border-status-info/50 text-foreground",
  success: "border-status-success/50 text-foreground",
  warning: "border-status-warning/50 text-foreground",
  danger: "border-status-critical/50 text-foreground",
} satisfies Record<ArtifactPreviewStatusTone, string>;

function ArtifactPreviewBlockView({ block }: { block: ArtifactPreviewBlock }) {
  switch (block.kind) {
    case "heading":
      return <p className="truncate text-xs font-semibold text-foreground">{block.text}</p>;
    case "text":
      return <p className={cn("line-clamp-3", textToneClasses[block.tone])}>{block.text}</p>;
    case "code":
      return (
        <pre className="overflow-hidden rounded border border-border bg-muted px-2 py-1.5 font-mono text-[0.68rem] leading-relaxed">
          <code>{block.lines.join("\n")}</code>
        </pre>
      );
    case "table":
      return <ArtifactPreviewTable columns={block.columns} rows={block.rows} />;
    case "chart":
      return <ArtifactPreviewChart label={block.label} shape={block.shape} values={block.values} />;
    case "metric":
      return (
        <div className="flex flex-col">
          <span className="truncate text-[0.68rem] text-muted-foreground">{block.label}</span>
          <span className="truncate text-lg leading-tight font-semibold tabular-nums">
            {block.value}
          </span>
        </div>
      );
    case "status":
      return (
        <span
          className={cn(
            "w-fit max-w-full truncate rounded-full border px-2 py-0.5 text-[0.68rem]",
            statusToneClasses[block.tone],
          )}
        >
          {block.label}
        </span>
      );
    case "file":
      return (
        <span className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
          <FileIcon className="size-3 shrink-0" />
          <span className="truncate font-mono">{block.path}</span>
        </span>
      );
    default:
      return exhaustivePreviewBlock(block);
  }
}

function ArtifactPreviewTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  return (
    <table className="w-full table-fixed border-collapse text-[0.68rem]">
      <thead>
        <tr>
          {columns.map((column, index) => (
            <th
              className="truncate border-b border-border px-1 py-0.5 text-start font-medium text-muted-foreground"
              key={index}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td className="truncate px-1 py-0.5" key={cellIndex}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const previewChartWidth = 100;
const previewChartHeight = 28;

/**
 * A static plot of a chart's first series.
 *
 * Recharts belongs to the opened document, not to eight rail cards, so a
 * preview draws its own shape: no axes, no legend, no tooltip, no animation,
 * and one SVG element per preview regardless of how many points the series
 * carries.
 */
function ArtifactPreviewChart({
  label,
  shape,
  values,
}: {
  label: string;
  shape: ArtifactPreviewChartShape;
  values: readonly number[];
}) {
  if (values.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="truncate text-[0.68rem] text-muted-foreground">{label}</span>
      <svg
        aria-hidden="true"
        className="h-7 w-full text-[var(--accent-cyan)]"
        preserveAspectRatio="none"
        viewBox={`0 0 ${previewChartWidth} ${previewChartHeight}`}
      >
        <ArtifactPreviewPlot shape={shape} values={values} />
      </svg>
    </div>
  );
}

function ArtifactPreviewPlot({
  shape,
  values,
}: {
  shape: ArtifactPreviewChartShape;
  values: readonly number[];
}) {
  switch (shape) {
    case "bars":
      return <ArtifactPreviewBars values={values} />;
    case "line":
      return (
        <polyline fill="none" points={plotPoints(values)} stroke="currentColor" strokeWidth={1.5} />
      );
    case "area": {
      const baseline = plotY(values, 0);
      return (
        <polygon
          fill="currentColor"
          fillOpacity={0.35}
          points={`0,${baseline} ${plotPoints(values)} ${previewChartWidth},${baseline}`}
          stroke="currentColor"
          strokeWidth={1}
        />
      );
    }
    case "slices":
      return <ArtifactPreviewSlices values={values} />;
    default:
      return exhaustivePreviewChartShape(shape);
  }
}

function ArtifactPreviewBars({ values }: { values: readonly number[] }) {
  const span = previewChartWidth / values.length;
  return (
    <>
      {values.map((value, index) => {
        const baseline = plotY(values, 0);
        const valueY = plotY(values, value);
        const height = Math.max(1, Math.abs(baseline - valueY));
        return (
          <rect
            fill="currentColor"
            height={height}
            key={index}
            width={Math.max(1, span - 1.5)}
            x={index * span}
            y={Math.min(baseline, valueY)}
          />
        );
      })}
    </>
  );
}

/**
 * Parts of a whole as one proportion strip.
 *
 * A pie small enough for a preview card is a set of unreadable wedges, so the
 * preview keeps the proportions and drops the geometry. Slice colour cycles the
 * same Setta accents the opened chart uses.
 */
const previewSliceAccents = [
  "var(--accent-cyan)",
  "var(--accent-violet)",
  "var(--accent-amber)",
  "var(--accent-green)",
] as const;

function ArtifactPreviewSlices({ values }: { values: readonly number[] }) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    return null;
  }
  let offset = 0;
  return (
    <>
      {values.map((value, index) => {
        const width = (Math.max(0, value) / total) * previewChartWidth;
        const x = offset;
        offset += width;
        return (
          <rect
            fill={previewSliceAccents[index % previewSliceAccents.length]}
            height={previewChartHeight}
            key={index}
            width={width}
            x={x}
            y={0}
          />
        );
      })}
    </>
  );
}

function plotPoints(values: readonly number[]): string {
  const step = values.length === 1 ? 0 : previewChartWidth / (values.length - 1);
  return values.map((value, index) => `${index * step},${plotY(values, value)}`).join(" ");
}

/**
 * One value's vertical coordinate in a plot with a real zero baseline.
 *
 * Including zero in the domain keeps negative bars, lines, and areas on the
 * correct side of the baseline instead of depicting them as positive values.
 */
function plotY(values: readonly number[], value: number): number {
  const lowest = Math.min(...values, 0);
  const highest = Math.max(...values, 0);
  const spread = highest - lowest;
  if (spread === 0) {
    return previewChartHeight;
  }
  return ((highest - value) / spread) * previewChartHeight;
}

function exhaustivePreviewBlock(block: never): never {
  throw new Error(`unsupported artifact preview block ${JSON.stringify(block)}`);
}

function exhaustivePreviewChartShape(shape: never): never {
  throw new Error(`unsupported artifact preview chart shape ${String(shape)}`);
}
