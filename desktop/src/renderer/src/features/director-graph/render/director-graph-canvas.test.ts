import { describe, expect, it } from "vitest";

import { DirectorGraphCanvas } from "./director-graph-canvas";
import { DirectorGraphRenderer } from "./director-graph-renderer";
import { graphSeededRandom } from "./graph-gl-programs";
import { graphQualityProfiles } from "./graph-quality";

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
          graphQualityProfiles.full,
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
