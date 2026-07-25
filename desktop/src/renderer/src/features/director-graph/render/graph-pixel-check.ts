/**
 * Canvas-pixel checks.
 *
 * Frame time says the graph drew fast. It does not say the graph drew. A
 * renderer that loses its context, mis-sizes a surface, or letterboxes the
 * reference frame into the wrong rectangle still reports a healthy 8 ms frame,
 * so the plan asks measurement to own "canvas-pixel checks for nonblank
 * rendering and correct framing" alongside the timing marks.
 *
 * The check reduces the drawn canvas to a luminance grid and asks two things of
 * it:
 *
 * 1. **Nonblank** — is there concentrated content, and not just the medium?
 * 2. **Framed** — does that content sit inside the letterboxed reference frame,
 *    centred on the spine and vertically where the live edge puts it?
 *
 * Two properties of the picture drive the design. The graph floats in a
 * drifting particle medium, so an "empty" canvas is not black and its brightest
 * *pixel* is as bright as a node's: blankness has to be judged on concentration,
 * which is what a cell mean measures. And the graph is letterboxed rather than
 * stretched, so the same node covers a seventh of the canvas width at 6K that it
 * covers on a phone: the grid therefore resolves the *reference frame* rather
 * than the canvas, which keeps one set of thresholds valid across every tier.
 *
 * Nothing here samples a clock or a random source: the same pixels always
 * produce the same verdict.
 */

import { graphLiveEdgeClipY, type GraphFitFrame } from "./graph-visual-language";

/** Cells across the letterboxed reference frame, on each axis. */
const referenceFrameCells = 32;

/** Grid bounds, so an extreme viewport cannot produce a degenerate grid. */
const gridBounds = { minimum: 16, maximum: 224 } as const;

/** The reported preview is always this size, whatever the grid resolved to. */
export const graphPixelPreviewSize = 32;

/** At most this many pixels are read per check, on a fixed stride. */
const maximumSampledPixels = 400_000;

/**
 * A cell is content at a third of the brightest cell, or this, whichever is
 * more. The floor is what keeps the medium out. Measured on the primary target:
 * an empty canvas peaks near 0.02 per cell and a drawn graph peaks near 0.30,
 * at both the laptop and the 6K tier — the grid resolves the reference frame,
 * so that separation does not move with the viewport.
 */
const contentCellFloor = 0.05;
const contentCellFraction = 0.33;

/** A cell is lit at a tenth of the brightest cell, or this floor. */
const litCellFloor = 0.01;
const litCellFraction = 0.1;

/** The canvas is blank unless the brightest cell reaches this. */
const minimumPeakCellLuminance = 0.08;

/** How far the content centroid may sit from the spine, in canvas fractions. */
const maximumCentroidOffsetX = 0.12;

/** Slack when testing content against the letterbox rectangle, in cells. */
const frameSlackCells = 1;

/**
 * The live edge sits at `graphLiveEdgeClipY` and the trajectory climbs above it,
 * so content is centred somewhere between the middle of the canvas and the live
 * edge. The band is wide because how far above depends on how much history the
 * fixture has.
 */
const contentBandY = { minimum: 0.18, maximum: 0.92 } as const;

/** Why a frame failed. Each one names the rule it broke, not a severity. */
type GraphPixelCheckFailure =
  | "blank"
  | "off-center"
  | "outside-frame-x"
  | "outside-frame-y"
  | "outside-live-edge-band";

interface GraphPixelGrid {
  readonly columns: number;
  readonly rows: number;
  /** Mean relative luminance per cell, row-major from the top-left, 0..1. */
  readonly cells: Float32Array;
  readonly sampledPixels: number;
  /** Brightest single sampled pixel. Reported, not judged: see the header. */
  readonly peakPixel: number;
}

export interface GraphCanvasPixelCheck {
  readonly ok: boolean;
  readonly failures: readonly GraphPixelCheckFailure[];
  readonly width: number;
  readonly height: number;
  readonly gridColumns: number;
  readonly gridRows: number;
  readonly peakPixelLuminance: number;
  readonly peakLuminance: number;
  readonly meanLuminance: number;
  /** The cell threshold content was separated at, so a failure is diagnosable. */
  readonly contentThreshold: number;
  readonly litCellRatio: number;
  readonly contentCells: number;
  /** Luminance-weighted centre of the content, in canvas fractions. */
  readonly contentCentroidX: number;
  readonly contentCentroidY: number;
  /** Extent of the content, in canvas fractions. */
  readonly contentSpanX: number;
  readonly contentSpanY: number;
  /** The letterboxed reference frame the content is checked against. */
  readonly frameSpanX: number;
  readonly frameSpanY: number;
  readonly liveEdgeY: number;
  /** A fixed-size max-pooled preview of the grid, for the run's artifact. */
  readonly preview: readonly number[];
}

export interface GraphPixelCheckInput {
  /** RGBA rows as `gl.readPixels` returns them: origin bottom-left. */
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly fit: GraphFitFrame;
}

/**
 * Grid resolution for a letterboxed frame: fixed cells across the graph's own
 * frame, however much canvas that frame occupies.
 */
export function graphPixelGridFor(fit: GraphFitFrame): {
  readonly columns: number;
  readonly rows: number;
} {
  const axis = (span: number): number =>
    Math.min(
      gridBounds.maximum,
      Math.max(gridBounds.minimum, Math.round(referenceFrameCells / Math.max(0.05, span))),
    );
  return { columns: axis(fit.fitX), rows: axis(fit.fitY) };
}

/**
 * Reduces the drawn canvas to a luminance grid. The stride is derived from the
 * surface size, so a 6K surface costs about what a phone one does and two runs
 * of the same size always read the same pixels.
 */
function reduceGraphPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  columns: number,
  rows: number,
): GraphPixelGrid {
  const cells = new Float32Array(columns * rows);
  const counts = new Uint32Array(columns * rows);
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / maximumSampledPixels)));
  const reduction: PixelReductionState = { peakPixel: 0, sampledPixels: 0 };
  for (let y = 0; y < height; y += stride) {
    reduceGraphPixelRow(
      { cells, columns, counts, height, pixels, rows, stride, width },
      y,
      reduction,
    );
  }
  normalizeGraphPixelCells(cells, counts);
  return {
    cells,
    columns,
    peakPixel: reduction.peakPixel,
    rows,
    sampledPixels: reduction.sampledPixels,
  };
}

interface PixelReductionInput {
  readonly cells: Float32Array;
  readonly columns: number;
  readonly counts: Uint32Array;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly rows: number;
  readonly stride: number;
  readonly width: number;
}

interface PixelReductionState {
  peakPixel: number;
  sampledPixels: number;
}

function reduceGraphPixelRow(
  input: PixelReductionInput,
  y: number,
  reduction: PixelReductionState,
): void {
  // `readPixels` hands back rows bottom-up; the grid is top-down.
  const row = Math.min(
    input.rows - 1,
    Math.floor(((input.height - 1 - y) / input.height) * input.rows),
  );
  for (let x = 0; x < input.width; x += input.stride) {
    const column = Math.min(input.columns - 1, Math.floor((x / input.width) * input.columns));
    const offset = (y * input.width + x) * 4;
    const luminance =
      (0.2126 * (input.pixels[offset] ?? 0) +
        0.7152 * (input.pixels[offset + 1] ?? 0) +
        0.0722 * (input.pixels[offset + 2] ?? 0)) /
      255;
    reduction.peakPixel = Math.max(reduction.peakPixel, luminance);
    const cell = row * input.columns + column;
    input.cells[cell] = (input.cells[cell] ?? 0) + luminance;
    input.counts[cell] = (input.counts[cell] ?? 0) + 1;
    reduction.sampledPixels += 1;
  }
}

function normalizeGraphPixelCells(cells: Float32Array, counts: Uint32Array): void {
  for (let index = 0; index < cells.length; index += 1) {
    const count = counts[index] ?? 0;
    cells[index] = count === 0 ? 0 : (cells[index] ?? 0) / count;
  }
}

/** Reduces the canvas and judges it. */
export function checkGraphCanvasPixels(input: GraphPixelCheckInput): GraphCanvasPixelCheck {
  const size = graphPixelGridFor(input.fit);
  const grid = reduceGraphPixels(input.pixels, input.width, input.height, size.columns, size.rows);
  return judgeGraphPixelGrid(grid, input.fit, input.width, input.height);
}

function judgeGraphPixelGrid(
  grid: GraphPixelGrid,
  fit: GraphFitFrame,
  width: number,
  height: number,
): GraphCanvasPixelCheck {
  const stats = gridStatistics(grid);
  const failures: GraphPixelCheckFailure[] = [];
  const blank = stats.peak < minimumPeakCellLuminance || stats.contentCells === 0;
  if (blank) {
    failures.push("blank");
  }
  const slackX = (frameSlackCells / grid.columns) * 2;
  const slackY = (frameSlackCells / grid.rows) * 2;
  if (!blank) {
    if (Math.abs(stats.centroidX - 0.5) > maximumCentroidOffsetX) {
      failures.push("off-center");
    }
    if (stats.spanX > fit.fitX + slackX) {
      failures.push("outside-frame-x");
    }
    if (stats.spanY > fit.fitY + slackY) {
      failures.push("outside-frame-y");
    }
    if (stats.centroidY < contentBandY.minimum || stats.centroidY > contentBandY.maximum) {
      failures.push("outside-live-edge-band");
    }
  }
  return {
    ok: failures.length === 0,
    failures,
    width,
    height,
    gridColumns: grid.columns,
    gridRows: grid.rows,
    peakPixelLuminance: grid.peakPixel,
    peakLuminance: stats.peak,
    meanLuminance: stats.mean,
    contentThreshold: stats.contentThreshold,
    litCellRatio: stats.litRatio,
    contentCells: stats.contentCells,
    contentCentroidX: stats.centroidX,
    contentCentroidY: stats.centroidY,
    contentSpanX: stats.spanX,
    contentSpanY: stats.spanY,
    frameSpanX: fit.fitX,
    frameSpanY: fit.fitY,
    liveEdgeY: (1 - graphLiveEdgeClipY) / 2,
    preview: previewOf(grid),
  };
}

/** Max-pools the grid to a fixed size so a report shows the same shape at any tier. */
function previewOf(grid: GraphPixelGrid): number[] {
  const preview = new Array<number>(graphPixelPreviewSize * graphPixelPreviewSize).fill(0);
  for (let row = 0; row < grid.rows; row += 1) {
    const previewRow = Math.min(
      graphPixelPreviewSize - 1,
      Math.floor((row / grid.rows) * graphPixelPreviewSize),
    );
    for (let column = 0; column < grid.columns; column += 1) {
      const previewColumn = Math.min(
        graphPixelPreviewSize - 1,
        Math.floor((column / grid.columns) * graphPixelPreviewSize),
      );
      const index = previewRow * graphPixelPreviewSize + previewColumn;
      preview[index] = Math.max(
        preview[index] ?? 0,
        Math.round((grid.cells[row * grid.columns + column] ?? 0) * 1000) / 1000,
      );
    }
  }
  return preview;
}

interface GridStatistics {
  readonly peak: number;
  readonly mean: number;
  readonly contentThreshold: number;
  readonly litRatio: number;
  readonly contentCells: number;
  readonly centroidX: number;
  readonly centroidY: number;
  readonly spanX: number;
  readonly spanY: number;
}

function gridStatistics(grid: GraphPixelGrid): GridStatistics {
  const luminance = gridLuminanceTotals(grid);
  const litThreshold = Math.max(litCellFloor, luminance.peak * litCellFraction);
  const contentThreshold = Math.max(contentCellFloor, luminance.peak * contentCellFraction);
  const content = gridContentStatistics(grid, litThreshold, contentThreshold);
  const cells = grid.columns * grid.rows;
  return {
    peak: luminance.peak,
    mean: cells === 0 ? 0 : luminance.total / cells,
    contentThreshold,
    litRatio: cells === 0 ? 0 : content.lit / cells,
    contentCells: content.cells,
    centroidX: content.weight === 0 ? 0.5 : content.weightedX / content.weight,
    centroidY: content.weight === 0 ? 0.5 : content.weightedY / content.weight,
    spanX:
      content.maximumColumn < 0
        ? 0
        : (content.maximumColumn - content.minimumColumn + 1) / grid.columns,
    spanY: content.maximumRow < 0 ? 0 : (content.maximumRow - content.minimumRow + 1) / grid.rows,
  };
}

function gridLuminanceTotals(grid: GraphPixelGrid): { peak: number; total: number } {
  let peak = 0;
  let total = 0;
  for (const value of grid.cells) {
    peak = Math.max(peak, value);
    total += value;
  }
  return { peak, total };
}

interface GridContentStatistics {
  cells: number;
  lit: number;
  maximumColumn: number;
  maximumRow: number;
  minimumColumn: number;
  minimumRow: number;
  weight: number;
  weightedX: number;
  weightedY: number;
}

function gridContentStatistics(
  grid: GraphPixelGrid,
  litThreshold: number,
  contentThreshold: number,
): GridContentStatistics {
  const result: GridContentStatistics = {
    cells: 0,
    lit: 0,
    maximumColumn: -1,
    maximumRow: -1,
    minimumColumn: grid.columns,
    minimumRow: grid.rows,
    weight: 0,
    weightedX: 0,
    weightedY: 0,
  };
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const value = grid.cells[row * grid.columns + column] ?? 0;
      if (value >= litThreshold) {
        result.lit += 1;
      }
      if (value < contentThreshold) {
        continue;
      }
      result.cells += 1;
      result.weight += value;
      result.weightedX += value * ((column + 0.5) / grid.columns);
      result.weightedY += value * ((row + 0.5) / grid.rows);
      result.minimumColumn = Math.min(result.minimumColumn, column);
      result.maximumColumn = Math.max(result.maximumColumn, column);
      result.minimumRow = Math.min(result.minimumRow, row);
      result.maximumRow = Math.max(result.maximumRow, row);
    }
  }
  return result;
}
