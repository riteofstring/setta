import { describe, expect, it } from "vitest";

import {
  advanceGraphLoadingAmount,
  DirectorGraphCanvas,
  graphAmbientFieldNeedsAnimation,
  graphGridTitleAnchorY,
  graphHoverNeedsAnimation,
  graphLoadingFieldNeedsAnimation,
} from "./director-graph-canvas";
import { DirectorGraphRenderer } from "./director-graph-renderer";
import { graphSeededRandom } from "./graph-gl-programs";
import { graphQualityProfile } from "./graph-quality";

/**
 * A canvas whose WebGL2 request fails, which is the one failure mode the graph
 * cannot draw through. The rest of the canvas host needs a real GPU context and
 * is exercised against the committed fixtures in the Electron harness.
 */
function canvasWithoutWebgl2(): HTMLCanvasElement {
  return { getContext: () => null } as unknown as HTMLCanvasElement;
}

describe("director graph renderer", () => {
  it("fails loudly when the platform has no WebGL2 context", () => {
    expect(
      () =>
        new DirectorGraphRenderer(
          canvasWithoutWebgl2(),
          undefined as unknown as Document,
          graphQualityProfile,
        ),
    ).toThrow(/WebGL2/u);
  });
});

describe("director graph canvas host", () => {
  it("surfaces a missing WebGL2 context instead of running a blank loop", () => {
    expect(
      () =>
        new DirectorGraphCanvas({
          canvas: canvasWithoutWebgl2(),
          labelRoot: {} as unknown as HTMLElement,
          ownerDocument: undefined as unknown as Document,
          viewportOf: () => ({ width: 1440, height: 900 }),
          devicePixelRatioOf: () => 1,
          timeSecondsAt: () => 0,
          reducedMotion: false,
        }),
    ).toThrow(/WebGL2/u);
  });

  it("does not keep the frame loop awake for a snapped reduced-motion hover", () => {
    expect(graphHoverNeedsAnimation(false, true, 1)).toBe(true);
    expect(graphHoverNeedsAnimation(false, false, 0.25)).toBe(true);
    expect(graphHoverNeedsAnimation(true, true, 1)).toBe(false);
    expect(graphHoverNeedsAnimation(true, false, 0)).toBe(false);
  });

  it("keeps the ambient field moving unless reduced motion is active", () => {
    expect(graphAmbientFieldNeedsAnimation(false, true)).toBe(true);
    expect(graphAmbientFieldNeedsAnimation(false, false)).toBe(false);
    expect(graphAmbientFieldNeedsAnimation(true, true)).toBe(false);
  });

  it("animates loading through its fade and holds one reduced-motion frame", () => {
    expect(advanceGraphLoadingAmount(0, true, 0.1, false)).toBeCloseTo(0.36);
    expect(advanceGraphLoadingAmount(1, false, 0.1, false)).toBeCloseTo(0.48);
    expect(advanceGraphLoadingAmount(0.4, true, 0.1, true)).toBe(1);
    expect(graphLoadingFieldNeedsAnimation(false, true, 1)).toBe(true);
    expect(graphLoadingFieldNeedsAnimation(false, false, 0.2)).toBe(true);
    expect(graphLoadingFieldNeedsAnimation(true, true, 1)).toBe(false);
  });

  it("keeps grid titles attached while overflow clips them", () => {
    expect(graphGridTitleAnchorY(120)).toBe(76);
    expect(graphGridTitleAnchorY(50)).toBe(6);
    expect(graphGridTitleAnchorY(940)).toBe(896);
  });
});

describe("graph seeded random", () => {
  it("produces the same field and particle layout on every run", () => {
    const first = Array.from({ length: 8 }, graphSeededRandom(4242));
    const second = Array.from({ length: 8 }, graphSeededRandom(4242));
    expect(first).toEqual(second);
    expect(Array.from({ length: 8 }, graphSeededRandom(911))).not.toEqual(first);
  });

  it("stays inside the unit interval", () => {
    const random = graphSeededRandom(7);
    for (let index = 0; index < 500; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
