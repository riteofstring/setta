// Overview wheel gesture classification.
//
// In overview a plain wheel can carry two different intents that the browser
// reports with otherwise identical fields: a real mouse wheel (the user wants to
// zoom) versus a two-finger trackpad swipe (the user wants to pan). We separate
// them with the device heuristic canvas editors use, anchored on the signals that
// are actually unambiguous:
//
//   - ctrlKey / metaKey   -> zoom. A trackpad pinch is delivered as a ctrl+wheel
//                            event, and an explicit Cmd/Ctrl+wheel is a deliberate
//                            zoom on any device.
//   - line / page delta   -> zoom. Only physical mouse wheels report
//                            DOM_DELTA_LINE / DOM_DELTA_PAGE; trackpads always send
//                            pixel deltas.
//   - coarse vertical notch -> zoom. A classic mouse wheel in pixel mode lands on
//                            coarse whole-pixel steps with no horizontal component.
//   - everything else     -> pan. Smooth / fractional / horizontally-tilted
//                            scrolling is a trackpad swipe.
//
// The ambiguous tail (a perfectly vertical, notch-sized trackpad flick) biases to
// the safer default for overview — pan — and the user can always zoom explicitly
// with pinch or Cmd/Ctrl+wheel.

export type OverviewWheelIntent = "pan" | "zoom";

export interface OverviewWheelSample {
  ctrlKey: boolean;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  metaKey: boolean;
}

// Coarse-step threshold (pixels) for mouse wheels that report DOM_DELTA_PIXEL.
const mouseWheelMinPixelStep = 40;
// Maps a deltaMode to an approximate pixel magnitude so line/page wheels and
// pixel trackpads share one sensitivity scale (used by the pan path).
const linePixelFactor = 16;
const pagePixelFactor = 720;
// d3-zoom / React Flow wheel response: `factor = 2 ** (-deltaY * step * boost)`.
// Per-deltaMode step sizes match d3-zoom so the feel is familiar; a pinch
// (ctrlKey) reports tiny per-event deltas, so it gets a large boost to cover a
// useful zoom range in one gesture.
const wheelZoomPixelStep = 0.002;
const wheelZoomLineStep = 0.05;
const wheelZoomPageStep = 1;
const pinchZoomBoost = 10;

export function classifyOverviewWheel(sample: OverviewWheelSample): OverviewWheelIntent {
  if (sample.ctrlKey || sample.metaKey) {
    return "zoom";
  }
  if (sample.deltaMode !== 0) {
    return "zoom";
  }
  return looksLikeMouseWheelNotch(sample) ? "zoom" : "pan";
}

function looksLikeMouseWheelNotch(sample: OverviewWheelSample): boolean {
  // Trackpad swipes routinely carry a horizontal component; a wheel notch does not.
  if (sample.deltaX !== 0) {
    return false;
  }
  return Number.isInteger(sample.deltaY) && Math.abs(sample.deltaY) >= mouseWheelMinPixelStep;
}

// Converts a wheel's deltaY into a multiplicative zoom factor (>1 zooms in, <1
// zooms out). Scroll up / pinch-open report a negative deltaY and zoom in. A
// pinch is boosted because its per-event deltas are an order of magnitude smaller
// than a mouse-wheel notch.
export function overviewWheelZoomFactor(deltaY: number, deltaMode: number, pinch: boolean): number {
  const step =
    deltaMode === 1 ? wheelZoomLineStep : deltaMode === 2 ? wheelZoomPageStep : wheelZoomPixelStep;
  const boost = pinch ? pinchZoomBoost : 1;
  return 2 ** (-deltaY * step * boost);
}

// Pixel magnitude of one wheel step for a given deltaMode (pixel / line / page).
export function wheelDeltaModePixelFactor(deltaMode: number): number {
  if (deltaMode === 1) {
    return linePixelFactor;
  }
  if (deltaMode === 2) {
    return pagePixelFactor;
  }
  return 1;
}
