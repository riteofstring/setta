import { describe, expect, test } from "vitest";

import { workflowGraphRendererResolution } from "./pixi-renderer-application";

describe("workflow graph Pixi renderer application", () => {
  test("caps huge backing stores below the pixel budget", () => {
    const resolution = workflowGraphRendererResolution({
      cssHeight: 2160,
      cssWidth: 3840,
      devicePixelRatio: 2,
      maxBackingPixels: 12_000_000,
    });

    expect(resolution).toBeCloseTo(Math.sqrt(12_000_000 / (3840 * 2160)), 6);
    expect(3840 * 2160 * resolution * resolution).toBeLessThanOrEqual(12_000_001);
  });

  test("keeps native device resolution when the backing store is already under budget", () => {
    expect(
      workflowGraphRendererResolution({
        cssHeight: 900,
        cssWidth: 1200,
        devicePixelRatio: 2,
        maxBackingPixels: 12_000_000,
      }),
    ).toBe(2);
  });
});
