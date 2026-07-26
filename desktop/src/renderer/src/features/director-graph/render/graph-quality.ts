/**
 * Explicit quality tiers and the adaptive render scale.
 *
 * The plan requires the device pixel ratio and render scale to be clamped
 * "through explicit quality tiers" rather than through constants buried in the
 * draw loop, and the target performance matrix supplies the starting clamps:
 * a device-pixel clamp of 1.5, a 3.6 MP ceiling on the post/dither pass, a
 * 2.3 MP ceiling on the scene pass, and an adaptive scale in [0.4, 1] driven by
 * GPU timer queries against the *observed* refresh period.
 *
 * Two knobs, kept apart on purpose:
 *
 * - **Tier** bounds work that does not depend on viewport size: particles per
 *   node, edge segments, field density, and the surface ceilings.
 * - **Render scale** is the continuous response to measured GPU time inside a
 *   tier. It only steps a tier when it has run out of room.
 *
 * A tier is *earned down*, never assigned by viewport size. See
 * `graphStartingQualityProfile` for why the viewport cannot predict the load.
 *
 * Reduced motion is not a tier. It is an accessibility mode that stops motion
 * and the analog effects while leaving fidelity alone.
 */

const graphQualityTiers = ["full", "balanced", "reduced"] as const;
export type GraphQualityTier = (typeof graphQualityTiers)[number];

interface GraphQualityEffects {
  /** CRT scanline modulation in the post and glyph passes. */
  readonly scanlines: boolean;
  readonly grain: boolean;
  /** Barrel curvature; overlays follow it, so turning it off moves labels too. */
  readonly barrel: boolean;
  /** Chromatic aberration and signal tear during a workstream switch. */
  readonly switchTear: boolean;
  /** The viscous flow field in the background medium. */
  readonly fieldFlow: boolean;
}

export interface GraphQualityProfile {
  readonly tier: GraphQualityTier;
  readonly particlesPerNode: number;
  readonly edgeSegments: number;
  readonly fieldParticles: number;
  /** Dither cell size in CSS pixels; held constant on screen across scales. */
  readonly ditherPixel: number;
  readonly devicePixelClamp: number;
  readonly scenePixelCeiling: number;
  readonly postPixelCeiling: number;
  /** Half-height of the drawn window in reference clip units. */
  readonly visibleHalfWindow: number;
  readonly effects: GraphQualityEffects;
}

const fullEffects: GraphQualityEffects = {
  scanlines: true,
  grain: true,
  barrel: true,
  switchTear: true,
  fieldFlow: true,
};

export const graphQualityProfiles = {
  full: {
    tier: "full",
    particlesPerNode: 24,
    edgeSegments: 12,
    fieldParticles: 5200,
    ditherPixel: 3,
    devicePixelClamp: 1.5,
    scenePixelCeiling: 2_300_000,
    postPixelCeiling: 3_600_000,
    visibleHalfWindow: 1.6,
    effects: fullEffects,
  },
  balanced: {
    tier: "balanced",
    particlesPerNode: 14,
    edgeSegments: 8,
    fieldParticles: 3400,
    ditherPixel: 3,
    devicePixelClamp: 1.5,
    scenePixelCeiling: 1_600_000,
    postPixelCeiling: 2_600_000,
    visibleHalfWindow: 1.5,
    effects: fullEffects,
  },
  reduced: {
    tier: "reduced",
    particlesPerNode: 8,
    edgeSegments: 5,
    fieldParticles: 1800,
    ditherPixel: 3.4,
    devicePixelClamp: 1.25,
    scenePixelCeiling: 900_000,
    postPixelCeiling: 1_500_000,
    visibleHalfWindow: 1.4,
    // The flow field is product identity, not a demo filter (fidelity
    // checklist section 1.2), so a tier step may thin the medium but may not
    // freeze it. Only the grade effects go.
    effects: { ...fullEffects, grain: false, switchTear: false },
  },
} satisfies Record<GraphQualityTier, GraphQualityProfile>;

/**
 * Accessibility override. The mockup's barrel, scanlines, tear, and pulses are
 * the declared reduced-motion divergence in the fidelity checklist; the barrel
 * stays because the label layer is aligned to it and removing it would detach
 * every overlay, but everything that moves stops.
 */
export function graphReducedMotionProfile(profile: GraphQualityProfile): GraphQualityProfile {
  return {
    ...profile,
    effects: { ...profile.effects, grain: false, switchTear: false, fieldFlow: false },
  };
}

/**
 * The tier every surface starts at.
 *
 * It does not read the viewport, because the viewport does not predict the
 * load. The two costs a tier varies split cleanly:
 *
 * - **Fragment cost** is already bounded by this profile's own ceilings. Per
 *   `docs/reports/performance/setta-4-target-performance-matrix-20260724.md`
 *   section 3.1, the laptop, 4K, and 6K tiers all resolve to a 2.30 MP scene
 *   pass and a 3.34–3.60 MP post pass. That report's first consequence states
 *   it directly: above roughly the laptop tier the ceilings hold GPU cost
 *   nearly constant, and larger displays differ only in sharpness.
 * - **Vertex and instance cost** — particles per node, edge segments, field
 *   density, the visible window — scales with the graph, not with the window.
 *   A 6K viewport does not add a node.
 *
 * So a viewport-area threshold spent fidelity to buy nothing: it thinned the
 * scene for surfaces whose measured cost the ceilings had already equalised.
 * The previous thresholds admitted `full` only below about a 1280×764 window
 * on a retina display, which is to say never.
 *
 * `GraphQualityController` still steps tiers down, but from measured GPU time
 * against the observed refresh period — which is the one signal that does
 * predict the load. This mirrors the mockup, which renders a single profile and
 * lets the adaptive render scale respond (mockup lines 830–847, 1035–1046).
 */
export function graphStartingQualityProfile(): GraphQualityProfile {
  return graphQualityProfiles.full;
}

export interface GraphSurfaceSizes {
  /** The dither/post pass, run near display resolution. */
  readonly postWidth: number;
  readonly postHeight: number;
  /** The particle/edge pass; capped and scaled, then upsampled by the post pass. */
  readonly sceneWidth: number;
  readonly sceneHeight: number;
  /** Scene pixels per CSS pixel, so point sizes stay a constant CSS size. */
  readonly scenePixelScale: number;
}

/**
 * Fits a surface under a pixel ceiling. The ceiling is a hard cap, so the
 * aspect-preserving scale is rounded down and then trimmed: rounding the two
 * dimensions independently can otherwise land a few hundred pixels over.
 */
function fitted(width: number, height: number, ceiling: number): { w: number; h: number } {
  const pixels = width * height;
  if (pixels <= ceiling) {
    return { w: width, h: height };
  }
  const scale = Math.sqrt(ceiling / pixels);
  let w = Math.max(1, Math.floor(width * scale));
  let h = Math.max(1, Math.floor(height * scale));
  while (w * h > ceiling && (w > 1 || h > 1)) {
    if (w >= h && w > 1) {
      w -= 1;
      continue;
    }
    h -= 1;
  }
  return { w, h };
}

/** Resolves both pass sizes for a viewport, tier, and adaptive scale. */
export function graphSurfaceSizes(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  profile: GraphQualityProfile,
  renderScale: number,
): GraphSurfaceSizes {
  const width = Math.max(1, cssWidth);
  const height = Math.max(1, cssHeight);
  const ratio = Math.min(Math.max(devicePixelRatio, 1), profile.devicePixelClamp);
  const post = fitted(
    Math.round(width * ratio),
    Math.round(height * ratio),
    profile.postPixelCeiling,
  );
  const capped = fitted(post.w, post.h, profile.scenePixelCeiling);
  const sceneWidth = Math.max(1, Math.round(capped.w * renderScale));
  const sceneHeight = Math.max(1, Math.round(capped.h * renderScale));
  return {
    postWidth: post.w,
    postHeight: post.h,
    sceneWidth,
    sceneHeight,
    scenePixelScale: sceneWidth / width,
  };
}

/**
 * Halftone cell size on the post surface.
 *
 * The authored cell is in CSS pixels so the dots stay a constant size on
 * screen, but the post surface is capped: at a 4K or 6K viewport it holds far
 * fewer device pixels than CSS pixels, and the cell shrinks with it. Below
 * about three surface pixels the dot mask stops resolving — a cell samples the
 * scene once, and with only two fragment centres across it every mid-tone dot
 * falls between them and is erased, which drains the graph to a dim blur. The
 * floor is the authored cell size, so the pattern is never asked to resolve
 * finer than it was designed for.
 */
const minimumDitherSurfacePixels = 3;

export function graphDitherCellPixels(
  ditherPixel: number,
  postWidth: number,
  cssWidth: number,
): number {
  const surfacePixels = ditherPixel * (postWidth / Math.max(1, cssWidth));
  return Math.max(minimumDitherSurfacePixels, surfacePixels);
}

/**
 * The frame budget for adaptation. ProMotion is adaptive, so the budget is
 * derived from the shortest observed frame delta rather than assumed; the
 * clamp keeps a hitch or a background throttle from redefining the target.
 */
export function graphRefreshPeriodMs(shortestFrameDeltaMs: number): number {
  return Math.max(6, Math.min(20, shortestFrameDeltaMs));
}

export const graphRenderScaleBounds = { minimum: 0.4, maximum: 1 } as const;

export interface GraphQualityDecision {
  readonly profile: GraphQualityProfile;
  readonly renderScale: number;
  /** True when the tier itself changed, which forces buffer rebuilds. */
  readonly tierChanged: boolean;
}

/**
 * Holds the graph inside the observed refresh period. Scale moves first because
 * it is free; a tier step costs a geometry rebuild, so it happens only once
 * scale has bottomed out or has been comfortable at full for a while.
 */
export class GraphQualityController {
  private profile: GraphQualityProfile;
  private renderScale: number = graphRenderScaleBounds.maximum;
  private comfortableSamples = 0;

  constructor(initial: GraphQualityProfile) {
    this.profile = initial;
  }

  current(): GraphQualityDecision {
    return { profile: this.profile, renderScale: this.renderScale, tierChanged: false };
  }

  /** Applies an explicit tier, e.g. a viewport change or a reduced-motion switch. */
  setProfile(profile: GraphQualityProfile): GraphQualityDecision {
    const tierChanged = profile.tier !== this.profile.tier;
    this.profile = profile;
    if (tierChanged) {
      this.renderScale = graphRenderScaleBounds.maximum;
      this.comfortableSamples = 0;
    }
    return { profile: this.profile, renderScale: this.renderScale, tierChanged };
  }

  /** One adaptation step from a measured GPU frame time. */
  sample(gpuFrameMs: number, refreshPeriodMs: number): GraphQualityDecision {
    if (gpuFrameMs <= 0) {
      return this.current();
    }
    if (gpuFrameMs > refreshPeriodMs * 0.78) {
      this.comfortableSamples = 0;
      if (this.renderScale > graphRenderScaleBounds.minimum) {
        this.renderScale = Math.max(graphRenderScaleBounds.minimum, this.renderScale * 0.85);
        return { profile: this.profile, renderScale: this.renderScale, tierChanged: false };
      }
      return this.stepTier(-1);
    }
    if (gpuFrameMs < refreshPeriodMs * 0.45) {
      if (this.renderScale < graphRenderScaleBounds.maximum) {
        this.comfortableSamples = 0;
        this.renderScale = Math.min(graphRenderScaleBounds.maximum, this.renderScale * 1.12);
        return { profile: this.profile, renderScale: this.renderScale, tierChanged: false };
      }
      this.comfortableSamples += 1;
      if (gpuFrameMs < refreshPeriodMs * 0.3 && this.comfortableSamples >= 8) {
        this.comfortableSamples = 0;
        return this.stepTier(1);
      }
      return this.current();
    }
    this.comfortableSamples = 0;
    return this.current();
  }

  private stepTier(direction: 1 | -1): GraphQualityDecision {
    const index = graphQualityTiers.indexOf(this.profile.tier);
    // `full` is index 0, so stepping up means stepping toward it.
    const next = index - direction;
    const tier = graphQualityTiers[next];
    if (tier === undefined) {
      return this.current();
    }
    this.profile = graphQualityProfiles[tier];
    this.renderScale = graphRenderScaleBounds.maximum;
    return { profile: this.profile, renderScale: this.renderScale, tierChanged: true };
  }
}
