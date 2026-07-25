import { describe, expect, it } from "vitest";

import {
  GraphQualityController,
  graphQualityForViewport,
  graphQualityProfiles,
  graphReducedMotionProfile,
  graphRefreshPeriodMs,
  graphRenderScaleBounds,
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
  it("starts a phone and a harness viewport at full fidelity", () => {
    expect(graphQualityForViewport(390, 844, 3).tier).toBe("full");
    expect(graphQualityForViewport(1440, 900, 1).tier).toBe("full");
  });

  it("steps down as the surface grows", () => {
    expect(graphQualityForViewport(1512, 982, 2).tier).toBe("balanced");
    expect(graphQualityForViewport(6016, 3384, 1).tier).toBe("reduced");
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
  it("drops the render scale before it drops a tier", () => {
    const controller = new GraphQualityController(full);
    const decision = controller.sample(8, 8.33);
    expect(decision.tierChanged).toBe(false);
    expect(decision.renderScale).toBeLessThan(graphRenderScaleBounds.maximum);
    expect(decision.profile.tier).toBe("full");
  });

  it("steps down a tier only once the scale has bottomed out", () => {
    const controller = new GraphQualityController(full);
    let decision = controller.current();
    for (let step = 0; step < 40 && !decision.tierChanged; step += 1) {
      decision = controller.sample(8, 8.33);
    }
    expect(decision.tierChanged).toBe(true);
    expect(decision.profile.tier).toBe("balanced");
    expect(decision.renderScale).toBe(graphRenderScaleBounds.maximum);
  });

  it("recovers the scale before it climbs back to a richer tier", () => {
    const controller = new GraphQualityController(graphQualityProfiles.balanced);
    controller.sample(8, 8.33);
    let decision = controller.sample(1, 8.33);
    expect(decision.renderScale).toBeGreaterThan(graphRenderScaleBounds.minimum);
    for (let step = 0; step < 40 && !decision.tierChanged; step += 1) {
      decision = controller.sample(1, 8.33);
    }
    expect(decision.profile.tier).toBe("full");
  });

  it("holds steady inside the comfortable band", () => {
    const controller = new GraphQualityController(full);
    const decision = controller.sample(8.33 * 0.6, 8.33);
    expect(decision.renderScale).toBe(graphRenderScaleBounds.maximum);
    expect(decision.tierChanged).toBe(false);
  });

  it("ignores a frame with no GPU measurement", () => {
    const controller = new GraphQualityController(full);
    expect(controller.sample(0, 8.33).renderScale).toBe(graphRenderScaleBounds.maximum);
  });

  it("resets the scale when a tier is applied explicitly", () => {
    const controller = new GraphQualityController(full);
    controller.sample(8, 8.33);
    const decision = controller.setProfile(graphQualityProfiles.reduced);
    expect(decision.tierChanged).toBe(true);
    expect(decision.renderScale).toBe(graphRenderScaleBounds.maximum);
  });
});
