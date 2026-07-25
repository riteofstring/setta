import { describe, expect, it } from "vitest";

import {
  checkGraphCanvasPixels,
  graphPixelGridFor,
  graphPixelPreviewSize,
} from "./graph-pixel-check";
import { graphFitFrame } from "./graph-visual-language";

/**
 * Builds a canvas the way the renderer leaves one: a sparse bright medium
 * everywhere, and optionally a concentrated ladder inside the letterboxed
 * reference frame. Rows are bottom-up, as `readPixels` returns them.
 */
function drawCanvas(
  width: number,
  height: number,
  options: {
    readonly mediumEvery?: number;
    readonly ladder?: { readonly centerX: number; readonly fromY: number; readonly toY: number };
    readonly nodeRadius?: number;
  },
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  const mediumEvery = options.mediumEvery ?? 37;
  for (let index = 0; index < width * height; index += 1) {
    if (index % mediumEvery === 0) {
      // One bright particle: as bright per pixel as a node, but never
      // concentrated, which is exactly why blankness is judged on cell means.
      pixels[index * 4] = 90;
      pixels[index * 4 + 1] = 190;
      pixels[index * 4 + 2] = 230;
      pixels[index * 4 + 3] = 255;
    }
  }
  const ladder = options.ladder;
  if (ladder !== undefined) {
    const radius = options.nodeRadius ?? Math.round(width * 0.012);
    const centerX = Math.round(ladder.centerX * width);
    for (let step = 0; step <= 6; step += 1) {
      const centerY = Math.round(
        (ladder.fromY + ((ladder.toY - ladder.fromY) * step) / 6) * height,
      );
      for (let y = centerY - radius; y <= centerY + radius; y += 1) {
        for (let x = centerX - radius; x <= centerX + radius; x += 1) {
          if (x < 0 || y < 0 || x >= width || y >= height) {
            continue;
          }
          // The buffer is bottom-up, so the requested top-down y is mirrored.
          const offset = ((height - 1 - y) * width + x) * 4;
          pixels[offset] = 220;
          pixels[offset + 1] = 250;
          pixels[offset + 2] = 255;
          pixels[offset + 3] = 255;
        }
      }
    }
  }
  return pixels;
}

describe("graph pixel grid", () => {
  it("resolves the reference frame rather than the canvas", () => {
    const laptop = graphPixelGridFor(graphFitFrame(1512, 982));
    const sixK = graphPixelGridFor(graphFitFrame(6016, 3384));
    // 6K letterboxes the same frame into a seventh of the width, so its grid is
    // finer by about that factor and a node still covers about a cell.
    expect(sixK.columns).toBeGreaterThan(laptop.columns * 3);
    expect(sixK.rows).toBeGreaterThan(laptop.rows);
  });
});

describe("graph canvas pixel check", () => {
  it("calls a medium-only canvas blank", () => {
    const fit = graphFitFrame(1512, 982);
    const check = checkGraphCanvasPixels({
      pixels: drawCanvas(1000, 650, {}),
      width: 1000,
      height: 650,
      fit,
    });
    expect(check.ok).toBe(false);
    expect(check.failures).toStrictEqual(["blank"]);
    expect(check.contentCells).toBe(0);
    // The medium is as bright per pixel as a node; only concentration differs.
    expect(check.peakPixelLuminance).toBeGreaterThan(0.4);
  });

  it("passes a centred ladder at the laptop tier", () => {
    const fit = graphFitFrame(1512, 982);
    const check = checkGraphCanvasPixels({
      pixels: drawCanvas(1000, 650, { ladder: { centerX: 0.5, fromY: 0.35, toY: 0.7 } }),
      width: 1000,
      height: 650,
      fit,
    });
    expect(check.failures).toStrictEqual([]);
    expect(check.ok).toBe(true);
    expect(check.contentCentroidX).toBeCloseTo(0.5, 1);
    expect(check.contentCentroidY).toBeGreaterThan(0.35);
    expect(check.contentCentroidY).toBeLessThan(0.7);
    expect(check.preview).toHaveLength(graphPixelPreviewSize * graphPixelPreviewSize);
  });

  it("catches a ladder drawn off the spine", () => {
    const fit = graphFitFrame(1512, 982);
    const check = checkGraphCanvasPixels({
      pixels: drawCanvas(1000, 650, { ladder: { centerX: 0.82, fromY: 0.35, toY: 0.7 } }),
      width: 1000,
      height: 650,
      fit,
    });
    expect(check.failures).toContain("off-center");
    expect(check.ok).toBe(false);
  });

  it("catches content stretched past the letterboxed frame", () => {
    const fit = graphFitFrame(1512, 982);
    const wide = drawCanvas(1000, 650, { ladder: { centerX: 0.5, fromY: 0.4, toY: 0.6 } });
    const spilled = drawCanvas(1000, 650, { ladder: { centerX: 0.5, fromY: 0.4, toY: 0.6 } });
    // Widen the ladder until it exceeds the letterbox: the graph is contained,
    // never stretched, so this is a real renderer/layout disagreement.
    for (let y = 300; y < 340; y += 1) {
      for (let x = 20; x < 980; x += 1) {
        const offset = ((650 - 1 - y) * 1000 + x) * 4;
        spilled[offset] = 220;
        spilled[offset + 1] = 250;
        spilled[offset + 2] = 255;
        spilled[offset + 3] = 255;
      }
    }
    expect(
      checkGraphCanvasPixels({ pixels: wide, width: 1000, height: 650, fit }).failures,
    ).toStrictEqual([]);
    expect(
      checkGraphCanvasPixels({ pixels: spilled, width: 1000, height: 650, fit }).failures,
    ).toContain("outside-frame-x");
  });

  it("catches a graph parked outside the live-edge band", () => {
    const fit = graphFitFrame(1512, 982);
    const check = checkGraphCanvasPixels({
      pixels: drawCanvas(1000, 650, { ladder: { centerX: 0.5, fromY: 0.01, toY: 0.06 } }),
      width: 1000,
      height: 650,
      fit,
    });
    expect(check.failures).toContain("outside-live-edge-band");
  });

  it("holds one threshold from a phone to 6K", () => {
    const phone = graphFitFrame(390, 844);
    const sixK = graphFitFrame(6016, 3384);
    const phoneCheck = checkGraphCanvasPixels({
      pixels: drawCanvas(585, 1266, {
        ladder: { centerX: 0.5, fromY: 0.4, toY: 0.75 },
        nodeRadius: 14,
      }),
      width: 585,
      height: 1266,
      fit: phone,
    });
    // The same graph inside the 6K letterbox: the frame is a third of the
    // canvas height there, so the ladder occupies proportionally less of it.
    const sixKCheck = checkGraphCanvasPixels({
      pixels: drawCanvas(2529, 1423, {
        ladder: { centerX: 0.5, fromY: 0.45, toY: 0.62 },
        nodeRadius: 9,
      }),
      width: 2529,
      height: 1423,
      fit: sixK,
    });
    expect(phoneCheck.failures).toStrictEqual([]);
    expect(sixKCheck.failures).toStrictEqual([]);
  });
});
