import type { ReactElement } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@renderer/components/ui/chart";

import type { artifactCatalogLimits } from "../generated/artifact-catalog-limits";
import type { ArtifactComponentProps } from "../generated/artifact-catalog-props";

type ChartSeries = ArtifactComponentProps["BarChart"]["series"];
type PieSlices = ArtifactComponentProps["PieChart"]["slices"];

/** Which Recharts plot a category chart draws. */
export type ArtifactCategoryChartKind = "area" | "bar" | "line";

/**
 * The artifact chart palette, one Setta accent per chart series.
 *
 * The accents follow the appearance settings, so a chart changes with the rest
 * of the app rather than carrying its own theme. The palette is declared to be
 * exactly as long as the catalog's series cap, so raising that cap without
 * adding an accent fails to compile here.
 */
const artifactChartPalette = [
  "var(--accent-cyan)",
  "var(--accent-violet)",
  "var(--accent-amber)",
  "var(--accent-green)",
  "var(--accent-magenta)",
  "var(--accent-blue)",
  "var(--accent-teal)",
  "var(--accent-red)",
] as const satisfies { length: typeof artifactCatalogLimits.maxChartSeries };

/**
 * The colour for one series or slice.
 *
 * A chart carries at most `maxChartSeries` series, which the palette covers
 * exactly, so no series repeats a colour. A pie may carry up to `maxPieSlices`,
 * which is more slices than Setta has accents, so slice colour cycles the
 * palette — the modulo keeps the index inside it, and a slice is identified by
 * its label rather than its colour.
 */
function paletteColor(index: number): string {
  return artifactChartPalette[index % artifactChartPalette.length] ?? artifactChartPalette[0];
}

/**
 * A chart across a shared category axis.
 *
 * The backend guarantees every series carries the same ordered point labels, so
 * the axis is read from the first series and each series contributes one value
 * per category. Series are keyed by position rather than by name because a
 * name is display text, not a data key.
 */
export function ArtifactCategoryChart({
  caption,
  kind,
  series,
}: {
  caption: string | undefined;
  kind: ArtifactCategoryChartKind;
  series: ChartSeries;
}) {
  const config = categoryChartConfig(series);
  return (
    <ArtifactChartFigure caption={caption} config={config}>
      {categoryPlot(kind, series, caption)}
    </ArtifactChartFigure>
  );
}

/** Parts of a whole. */
export function ArtifactPieChart({
  caption,
  slices,
}: {
  caption: string | undefined;
  slices: PieSlices;
}) {
  const config: ChartConfig = Object.fromEntries(
    slices.map((slice, index) => [
      sliceKey(index),
      { label: slice.label, color: paletteColor(index) },
    ]),
  );
  const data = slices.map((slice, index) => ({
    key: sliceKey(index),
    label: slice.label,
    value: slice.value,
  }));
  return (
    <ArtifactChartFigure caption={caption} config={config}>
      <PieChart accessibilityLayer aria-label={caption ?? "Pie chart"}>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" />} />
        <Pie data={data} dataKey="value" isAnimationActive={false} nameKey="key">
          {data.map((slice) => (
            <Cell fill={`var(--color-${slice.key})`} key={slice.key} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" />} />
      </PieChart>
    </ArtifactChartFigure>
  );
}

function ArtifactChartFigure({
  caption,
  children,
  config,
}: {
  caption: string | undefined;
  children: ReactElement;
  config: ChartConfig;
}) {
  return (
    <figure className="flex flex-col gap-1.5">
      <ChartContainer
        className="max-h-64 w-full [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-2"
        config={config}
      >
        {children}
      </ChartContainer>
      {caption === undefined ? null : (
        <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  );
}

function categoryChartConfig(series: ChartSeries): ChartConfig {
  return Object.fromEntries(
    series.map((entry, index) => [
      seriesKey(index),
      { label: entry.name, color: paletteColor(index) },
    ]),
  );
}

/**
 * One row per category, carrying every series' value for it.
 *
 * The first series decides the axis order. A later series that disagreed about
 * its labels would already have been rejected before the document was stored.
 */
function categoryRows(series: ChartSeries): Record<string, number | string>[] {
  const axis = series[0]?.points ?? [];
  return axis.map((point, pointIndex) => {
    const row: Record<string, number | string> = { label: point.label };
    for (const [seriesIndex, entry] of series.entries()) {
      const value = entry.points[pointIndex];
      if (value !== undefined) {
        row[seriesKey(seriesIndex)] = value.value;
      }
    }
    return row;
  });
}

// Recharts reads a chart's axes, plots, tooltip, and legend from its own direct
// children, so these stay written out per plot rather than shared through a
// wrapper component that Recharts would not look inside.
function categoryPlot(
  kind: ArtifactCategoryChartKind,
  series: ChartSeries,
  caption: string | undefined,
): ReactElement {
  const rows = categoryRows(series);
  const legend = series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null;
  const label = caption ?? categoryChartLabel(kind);
  switch (kind) {
    case "bar":
      /*
       * A bar is a stroke, not a slab.
       *
       * Recharts sizes bars to fill their band, which on a wide artifact turns
       * three data points into three saturated blocks — the loudest thing on
       * the page by a wide margin, and louder than the graph it sits next to.
       * A capped width and a falloff toward the baseline make it read as the
       * same luminous material as the canvas.
       */
      return (
        <BarChart accessibilityLayer aria-label={label} data={rows}>
          <defs>
            {series.map((entry, index) => (
              <linearGradient
                id={`${seriesKey(index)}-fill`}
                key={entry.name}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={`var(--color-${seriesKey(index)})`}
                  stopOpacity={0.95}
                />
                <stop
                  offset="100%"
                  stopColor={`var(--color-${seriesKey(index)})`}
                  stopOpacity={0.22}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--director-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={10} />
          <YAxis axisLine={false} tickLine={false} tickMargin={10} width={44} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {series.map((entry, index) => (
            <Bar
              dataKey={seriesKey(index)}
              fill={`url(#${seriesKey(index)}-fill)`}
              isAnimationActive={false}
              key={entry.name}
              maxBarSize={30}
              radius={[2, 2, 0, 0]}
            />
          ))}
          {legend}
        </BarChart>
      );
    case "line":
      return (
        <LineChart accessibilityLayer aria-label={label} data={rows}>
          <CartesianGrid stroke="var(--director-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={10} />
          <YAxis axisLine={false} tickLine={false} tickMargin={10} width={44} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {series.map((entry, index) => (
            <Line
              dataKey={seriesKey(index)}
              dot={false}
              isAnimationActive={false}
              key={entry.name}
              stroke={`var(--color-${seriesKey(index)})`}
              strokeWidth={2}
            />
          ))}
          {legend}
        </LineChart>
      );
    case "area":
      return (
        <AreaChart accessibilityLayer aria-label={label} data={rows}>
          <CartesianGrid stroke="var(--director-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={10} />
          <YAxis axisLine={false} tickLine={false} tickMargin={10} width={44} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {series.map((entry, index) => (
            <Area
              dataKey={seriesKey(index)}
              fill={`var(--color-${seriesKey(index)})`}
              fillOpacity={0.2}
              isAnimationActive={false}
              key={entry.name}
              stroke={`var(--color-${seriesKey(index)})`}
              strokeWidth={2}
            />
          ))}
          {legend}
        </AreaChart>
      );
  }
}

function categoryChartLabel(kind: ArtifactCategoryChartKind): string {
  switch (kind) {
    case "area":
      return "Area chart";
    case "bar":
      return "Bar chart";
    case "line":
      return "Line chart";
  }
}

function seriesKey(index: number): string {
  return `series-${index}`;
}

function sliceKey(index: number): string {
  return `slice-${index}`;
}
