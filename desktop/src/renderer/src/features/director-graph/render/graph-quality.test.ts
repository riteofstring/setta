import { describe, expect, it } from "vitest";

import {
  graphDitherCellPixels,
  GraphQualityController,
  graphQualityProfiles,
  graphReducedMotionProfile,
  graphRefreshPeriodMs,
  graphRenderScaleBounds,
  graphStartingQualityProfile,
  graphSurfaceSizes,
} from "./graph-quality";

const full = graphQualityProfiles.full;

describe("graph surface sizing", () => {
  it("clamps the device pixel ratio to the tier", () => {
    const sizes = graphSurfaceSizes(390, 844, 3, full, 1);
    expect(sizes.postWidth).toBe(Math.round(390 * full.devicePixelClamp));
    expect(sizes.postHeight).toBe(Math.round(844 * full.devicePixelClamp));
  });

  it("holds the scene pass under its ceiling at 4K and 6K alike", () => {
    const desktop4k = graphSurfaceSizes(3840, 2160, 1, full, 1);
    const desktop6k = graphSurfaceSizes(6016, 3384, 1, full, 1);
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

  it("shrinks only the scene pass when the render scale drops", () => {
    const one = graphSurfaceSizes(1512, 982, 2, full, 1);
    const half = graphSurfaceSizes(1512, 982, 2, full, 0.5);
    expect(half.postWidth).toBe(one.postWidth);
    expect(half.sceneWidth).toBeLessThan(one.sceneWidth);
    expect(half.scenePixelScale).toBeLessThan(one.scenePixelScale);
  });

  it("leaves a small viewport at its native size", () => {
    const sizes = graphSurfaceSizes(1440, 900, 1, full, 1);
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
    const laptop = graphSurfaceSizes(1512, 982, 2, start, 1);
    const desktop4k = graphSurfaceSizes(3840, 2160, 1, start, 1);
    const desktop6k = graphSurfaceSizes(6016, 3384, 1, start, 1);
    for (const sizes of [laptop, desktop4k, desktop6k]) {
      expect(sizes.sceneWidth * sizes.sceneHeight).toBeLessThanOrEqual(start.scenePixelCeiling);
      expect(sizes.postWidth * sizes.postHeight).toBeLessThanOrEqual(start.postPixelCeiling);
    }
    expect(desktop6k.sceneWidth * desktop6k.sceneHeight).toBeCloseTo(
      desktop4k.sceneWidth * desktop4k.sceneHeight,
      -4,
    );
  });

  it("keeps the field flowing at one density and brightness at every tier", () => {
    // The field is product identity: a tier step may never freeze it, thin
    // it, or coarsen the dither — those read as the display dimming, not as
    // a quality decision. The still field is reachable only through the
    // accessibility path below.
    for (const profile of Object.values(graphQualityProfiles)) {
      expect(profile.effects.fieldFlow).toBe(true);
      expect(profile.fieldParticles).toBe(graphQualityProfiles.full.fieldParticles);
      expect(profile.ditherPixel).toBe(graphQualityProfiles.full.ditherPixel);
    }
  });

  it("stops motion under reduced motion without dropping fidelity", () => {
    const reduced = graphReducedMotionProfile(full);
    expect(reduced.tier).toBe(full.tier);
    expect(reduced.particlesPerNode).toBe(full.particlesPerNode);
    expect(reduced.effects.switchTear).toBe(false);
    expect(reduced.effects.fieldFlow).toBe(false);
    expect(reduced.effects.grain).toBe(false);
    // The overlay layer is aligned to the barrel, so removing it would detach
    // every label from the node it annotates.
    expect(reduced.effects.barrel).toBe(true);
  });
});

describe("graph refresh period", () => {
  it("derives the budget from the observed frame delta", () => {
    expect(graphRefreshPeriodMs(8.33)).toBeCloseTo(8.33, 5);
    expect(graphRefreshPeriodMs(1)).toBe(6);
    expect(graphRefreshPeriodMs(200)).toBe(20);
  });
});

describe("graph quality controller", () => {
  /** Applies `count` identical samples and returns the last decision. */
  function sampled(
    controller: GraphQualityController,
    gpuFrameMs: number,
    count: number,
  ): ReturnType<GraphQualityController["sample"]> {
    let decision = controller.current();
    for (let step = 0; step < count; step += 1) {
      decision = controller.sample(gpuFrameMs, 8.33);
    }
    return decision;
  }

  it("ignores a hitch and reacts only to sustained pressure", () => {
    const controller = new GraphQualityController(full);
    // A few over-budget frames are a hitch, not a load: nothing moves, so
    // the picture cannot dim a step and brighten again moments later.
    expect(sampled(controller, 8, 3).renderScale).toBe(graphRenderScaleBounds.maximum);
    const decision = sampled(controller, 8, 4);
    expect(decision.tierChanged).toBe(false);
    expect(decision.renderScale).toBeLessThan(graphRenderScaleBounds.maximum);
    expect(decision.profile.tier).toBe("full");
  });

  it("steps down a tier only once the scale has bottomed out", () => {
    const controller = new GraphQualityController(full);
    let decision = controller.current();
    for (let step = 0; step < 300 && !decision.tierChanged; step += 1) {
      decision = controller.sample(8, 8.33);
    }
    expect(decision.tierChanged).toBe(true);
    expect(decision.profile.tier).toBe("balanced");
    expect(decision.renderScale).toBe(graphRenderScaleBounds.maximum);
  });

  it("recovers slowly: long comfort raises the scale, then the tier", () => {
    const controller = new GraphQualityController(graphQualityProfiles.balanced);
    sampled(controller, 8, 10);
    expect(controller.current().renderScale).toBeLessThan(graphRenderScaleBounds.maximum);
    let decision = controller.current();
    let upscaledAtSample = 0;
    for (let step = 0; step < 400 && !decision.tierChanged; step += 1) {
      decision = controller.sample(1, 8.33);
      if (upscaledAtSample === 0 && decision.renderScale === graphRenderScaleBounds.maximum) {
        upscaledAtSample = step + 1;
      }
    }
    // The scale must be back at full well before the tier climbs.
    expect(upscaledAtSample).toBeGreaterThan(1);
    expect(decision.tierChanged).toBe(true);
    expect(decision.profile.tier).toBe("full");
  });

  it("holds steady inside the comfortable band", () => {
    const controller = new GraphQualityController(full);
    const decision = sampled(controller, 8.33 * 0.6, 50);
    expect(decision.renderScale).toBe(graphRenderScaleBounds.maximum);
    expect(decision.tierChanged).toBe(false);
  });

  it("ignores a frame with no GPU measurement", () => {
    const controller = new GraphQualityController(full);
    expect(controller.sample(0, 8.33).renderScale).toBe(graphRenderScaleBounds.maximum);
  });

  it("resets the scale when a tier is applied explicitly", () => {
    const controller = new GraphQualityController(full);
    sampled(controller, 8, 10);
    const decision = controller.setProfile(graphQualityProfiles.reduced);
    expect(decision.tierChanged).toBe(true);
    expect(decision.renderScale).toBe(graphRenderScaleBounds.maximum);
  });
});

describe("graph dither cell", () => {
  it("keeps the authored cell size where the surface has the pixels", () => {
    // Laptop: the post surface holds more device pixels than CSS pixels, so the
    // authored 3 CSS-pixel cell is larger than 3 on the surface.
    expect(graphDitherCellPixels(3, 2000, 1512)).toBeCloseTo(3.968, 3);
    expect(graphDitherCellPixels(3, 1440, 1440)).toBe(3);
  });

  it("never asks the halftone to resolve finer than it was designed for", () => {
    // 4K and 6K cap the post surface far below their logical size. A cell of
    // about two surface pixels samples the scene once and leaves two fragment
    // centres to resolve the dot, which erases every mid-tone.
    expect(graphDitherCellPixels(3, 2529, 3840)).toBe(3);
    expect(graphDitherCellPixels(3, 2529, 6016)).toBe(3);
    expect(graphDitherCellPixels(3.4, 1632, 3840)).toBe(3);
  });
});
