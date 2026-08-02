import { describe, expect, it } from "vitest";

import {
  graphDitherCellPixels,
  graphQualityProfile,
  graphReducedMotionProfile,
  graphStartingQualityProfile,
  graphSurfaceSizes,
} from "./graph-quality";

const full = graphQualityProfile;

describe("graph surface sizing", () => {
  it("clamps the device pixel ratio to the tier", () => {
    const sizes = graphSurfaceSizes(390, 844, 3, full);
    expect(sizes.postWidth).toBe(Math.round(390 * full.devicePixelClamp));
    expect(sizes.postHeight).toBe(Math.round(844 * full.devicePixelClamp));
  });

  it("holds the scene pass under its ceiling at 4K and 6K alike", () => {
    const desktop4k = graphSurfaceSizes(3840, 2160, 1, full);
    const desktop6k = graphSurfaceSizes(6016, 3384, 1, full);
    expect(desktop4k.postWidth * desktop4k.postHeight).toBeLessThanOrEqual(full.postPixelCeiling);
    expect(desktop6k.postWidth * desktop6k.postHeight).toBeLessThanOrEqual(full.postPixelCeiling);
    expect(desktop4k.sceneWidth * desktop4k.sceneHeight).toBeLessThanOrEqual(
      full.scenePixelCeiling,
    );
    expect(desktop6k.sceneWidth * desktop6k.sceneHeight).toBeLessThanOrEqual(
      full.scenePixelCeiling,
    );
    expect(desktop6k.sceneWidth).toBeCloseTo(desktop4k.sceneWidth, -1);
  });

  it("resolves a viewport to one stable pair of surfaces", () => {
    const first = graphSurfaceSizes(1512, 982, 2, full);
    const second = graphSurfaceSizes(1512, 982, 2, full);
    expect(second).toEqual(first);
  });

  it("leaves a small viewport at its native size", () => {
    const sizes = graphSurfaceSizes(1440, 900, 1, full);
    expect(sizes.postWidth).toBe(1440);
    expect(sizes.sceneWidth).toBe(1440);
    expect(sizes.scenePixelScale).toBe(1);
  });
});

describe("graph quality tier selection", () => {
  it("starts at full fidelity, because the viewport does not predict the load", () => {
    expect(graphStartingQualityProfile().tier).toBe("full");
  });

  it("holds every matrix viewport under the same ceilings at full", () => {
    // The performance matrix's first consequence: above roughly the laptop
    // tier the ceilings equalise GPU cost, so a larger display buys sharpness
    // and costs nothing extra. That is why none of these starts lower.
    const start = graphStartingQualityProfile();
    const laptop = graphSurfaceSizes(1512, 982, 2, start);
    const desktop4k = graphSurfaceSizes(3840, 2160, 1, start);
    const desktop6k = graphSurfaceSizes(6016, 3384, 1, start);
    for (const sizes of [laptop, desktop4k, desktop6k]) {
      expect(sizes.sceneWidth * sizes.sceneHeight).toBeLessThanOrEqual(start.scenePixelCeiling);
      expect(sizes.postWidth * sizes.postHeight).toBeLessThanOrEqual(start.postPixelCeiling);
    }
    expect(desktop6k.sceneWidth * desktop6k.sceneHeight).toBeCloseTo(
      desktop4k.sceneWidth * desktop4k.sceneHeight,
      -4,
    );
  });

  it("keeps the mockup's field density and dither cell in the fixed profile", () => {
    expect(graphStartingQualityProfile().fieldParticles).toBe(5200);
    expect(graphStartingQualityProfile().ditherPixel).toBe(3);
  });

  it("stops motion under reduced motion without dropping fidelity", () => {
    const reduced = graphReducedMotionProfile(full);
    expect(reduced.tier).toBe(full.tier);
    expect(reduced.particlesPerNode).toBe(full.particlesPerNode);
    expect(reduced.effects.switchTear).toBe(false);
    expect(reduced.effects.grain).toBe(false);
    // The overlay layer is aligned to the barrel, so removing it would detach
    // every label from the node it annotates.
    expect(reduced.effects.barrel).toBe(true);
  });
});

describe("graph dither cell", () => {
  it("keeps the authored cell size where the surface has the pixels", () => {
    // Laptop: the post surface holds more device pixels than CSS pixels, so the
    // authored 3 CSS-pixel cell is larger than 3 on the surface.
    expect(graphDitherCellPixels(3, 2000, 1512)).toBeCloseTo(3.968, 3);
    expect(graphDitherCellPixels(3, 1440, 1440)).toBe(3);
  });

  it("uses the mockup's floor when the post surface is capped", () => {
    expect(graphDitherCellPixels(3, 2529, 3840)).toBeCloseTo(1.976, 3);
    expect(graphDitherCellPixels(3, 2529, 6016)).toBe(1.6);
    expect(graphDitherCellPixels(3.4, 1632, 3840)).toBe(1.6);
  });
});
