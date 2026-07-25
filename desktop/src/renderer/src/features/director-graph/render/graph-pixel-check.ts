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
  let sampled = 0;
  let peakPixel = 0;
  for (let y = 0; y < height; y += stride) {
    // `readPixels` hands back rows bottom-up; the grid is top-down.
    const row = Math.min(rows - 1, Math.floor(((height - 1 - y) / height) * rows));
    for (let x = 0; x < width; x += stride) {
      const column = Math.min(columns - 1, Math.floor((x / width) * columns));
      const offset = (y * width + x) * 4;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      peakPixel = Math.max(peakPixel, luminance);
      const cell = row * columns + column;
      cells[cell] = (cells[cell] ?? 0) + luminance;
      counts[cell] = (counts[cell] ?? 0) + 1;
      sampled += 1;
    }
  }
  for (let index = 0; index < cells.length; index += 1) {
    const count = counts[index] ?? 0;
    cells[index] = count === 0 ? 0 : (cells[index] ?? 0) / count;
  }
  return { columns, rows, cells, sampledPixels: sampled, peakPixel };
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
  let peak = 0;
  let total = 0;
  for (const value of grid.cells) {
    peak = Math.max(peak, value);
    total += value;
  }
  const litThreshold = Math.max(litCellFloor, peak * litCellFraction);
  const contentThreshold = Math.max(contentCellFloor, peak * contentCellFraction);
  let lit = 0;
  let contentCells = 0;
  let weight = 0;
  let weightedX = 0;
  let weightedY = 0;
  let minimumColumn = grid.columns;
  let maximumColumn = -1;
  let minimumRow = grid.rows;
  let maximumRow = -1;
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const value = grid.cells[row * grid.columns + column] ?? 0;
      if (value >= litThreshold) {
        lit += 1;
      }
      if (value < contentThreshold) {
        continue;
      }
      contentCells += 1;
      weight += value;
      weightedX += value * ((column + 0.5) / grid.columns);
      weightedY += value * ((row + 0.5) / grid.rows);
      minimumColumn = Math.min(minimumColumn, column);
      maximumColumn = Math.max(maximumColumn, column);
      minimumRow = Math.min(minimumRow, row);
      maximumRow = Math.max(maximumRow, row);
    }
  }
  const cells = grid.columns * grid.rows;
  return {
    peak,
    mean: cells === 0 ? 0 : total / cells,
    contentThreshold,
    litRatio: cells === 0 ? 0 : lit / cells,
    contentCells,
    centroidX: weight === 0 ? 0.5 : weightedX / weight,
    centroidY: weight === 0 ? 0.5 : weightedY / weight,
    spanX: maximumColumn < 0 ? 0 : (maximumColumn - minimumColumn + 1) / grid.columns,
    spanY: maximumRow < 0 ? 0 : (maximumRow - minimumRow + 1) / grid.rows,
  };
}
