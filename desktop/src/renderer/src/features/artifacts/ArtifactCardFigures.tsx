import type { ArtifactCardFigures, ArtifactSeriesShape } from "./artifact-card-figures";

/**
 * Draws one artifact's card figures.
 *
 * Deliberately not the catalog's components: a card carries no tab, accordion,
 * link, copy control, chart tooltip, or file action, and it must not pull
 * Recharts or the OpenUI renderer into the command center's chunk. Nothing
 * here is focusable or interactive.
 */
export function ArtifactCardFigureView({ figures }: { figures: ArtifactCardFigures }) {
  if (figures.metric === null && figures.series === null) {
    return null;
  }
  return (
    <div className="director-artifact-figures">
      {figures.metric === null ? null : (
        <p className="director-artifact-figure">
          <b>{figures.metric.value}</b>
          <span>{figures.metric.label}</span>
        </p>
      )}
      {figures.series === null ? null : (
        <ArtifactSparkline shape={figures.series.shape} values={figures.series.values} />
      )}
    </div>
  );
}

const sparklineWidth = 100;
const sparklineHeight = 22;

/**
 * A chart's first series at the size a card draws it.
 *
 * No axis, no legend, no labels, no tooltip, no animation, and one SVG element
 * per card whatever the series length. The point is the shape of the data, not
 * a reading of it — the number beside it is what a reader takes away, and the
 * document is one click behind the card.
 */
function ArtifactSparkline({
  shape,
  values,
}: {
  shape: ArtifactSeriesShape;
  values: readonly number[];
}) {
  return (
    <svg
      aria-hidden="true"
      className="director-artifact-spark"
      preserveAspectRatio="none"
      viewBox={`0 0 ${sparklineWidth} ${sparklineHeight}`}
    >
      <ArtifactSparkPlot shape={shape} values={values} />
    </svg>
  );
}

function ArtifactSparkPlot({
  shape,
  values,
}: {
  shape: ArtifactSeriesShape;
  values: readonly number[];
}) {
  switch (shape) {
    case "bars":
      return <ArtifactSparkBars values={values} />;
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
          points={`0,${baseline} ${plotPoints(values)} ${sparklineWidth},${baseline}`}
          stroke="currentColor"
          strokeWidth={1}
        />
      );
    }
    case "slices":
      return <ArtifactSparkSlices values={values} />;
    default:
      return exhaustiveSeriesShape(shape);
  }
}

/*
 * A spark bar is a stroke, not a slab.
 *
 * The plot is stretched to the card's width, so a bar sized to fill its band
 * lands 40px wide and turns a six-point series into a row of blocks — the same
 * mistake the document's own chart made before it was capped. The cap is in
 * viewBox units, so it tracks the rail's width down to its floor.
 */
const maxSparkBarWidth = 2.4;

function ArtifactSparkBars({ values }: { values: readonly number[] }) {
  const span = sparklineWidth / values.length;
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
            width={Math.min(Math.max(1, span - 1.5), maxSparkBarWidth)}
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
 * A pie small enough for a card is a set of unreadable wedges, so the card
 * keeps the proportions and drops the geometry.
 */
function ArtifactSparkSlices({ values }: { values: readonly number[] }) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    return null;
  }
  let offset = 0;
  return (
    <>
      {values.map((value, index) => {
        const width = (Math.max(0, value) / total) * sparklineWidth;
        const x = offset;
        offset += width;
        return (
          <rect
            fill="currentColor"
            fillOpacity={1 - (index % 3) * 0.28}
            height={sparklineHeight}
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
  const step = values.length === 1 ? 0 : sparklineWidth / (values.length - 1);
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
    return sparklineHeight;
  }
  return ((highest - value) / spread) * sparklineHeight;
}

function exhaustiveSeriesShape(shape: never): never {
  throw new Error(`unsupported artifact series shape ${String(shape)}`);
}
