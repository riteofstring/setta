/**
 * The graph's fixed rendering profile.
 *
 * Resolution is part of the picture: changing the scene surface under a fixed
 * post surface changes how the fluid particles resolve into halftone cells.
 * Runtime quality stepping therefore made the field visibly brighten, dull, and
 * change dot weight, while reallocating the scene texture on an animation
 * frame. The graph now holds one profile for its lifetime. The existing pixel
 * ceilings bound viewport cost without changing the picture after mount.
 *
 * Reduced motion is an accessibility mode, not a quality level. It stops motion
 * and the analog effects while retaining the same geometry and surfaces.
 */

export type GraphQualityTier = "full";

interface GraphQualityEffects {
  /** CRT scanline modulation in the post and glyph passes. */
  readonly scanlines: boolean;
  readonly grain: boolean;
  /** Barrel curvature; overlays follow it, so turning it off moves labels too. */
  readonly barrel: boolean;
  /** Chromatic aberration and signal tear during a workstream switch. */
  readonly switchTear: boolean;
}

export interface GraphQualityProfile {
  readonly tier: GraphQualityTier;
  readonly particlesPerNode: number;
  readonly edgeSegments: number;
  readonly fieldParticles: number;
  /** Dither cell size in CSS pixels; held constant across device pixel ratios. */
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
};

export const graphQualityProfile = {
  tier: "full",
  particlesPerNode: 24,
  edgeSegments: 12,
  fieldParticles: 5200,
  ditherPixel: 3,
  devicePixelClamp: 1.5,
  scenePixelCeiling: 2_000_000,
  postPixelCeiling: 3_600_000,
  visibleHalfWindow: 1.6,
  effects: fullEffects,
} satisfies GraphQualityProfile;

/**
 * Accessibility override. The mockup's barrel, scanlines, tear, and pulses are
 * the declared reduced-motion divergence in the fidelity checklist; the barrel
 * stays because the label layer is aligned to it and removing it would detach
 * every overlay, but everything that moves stops.
 */
export function graphReducedMotionProfile(profile: GraphQualityProfile): GraphQualityProfile {
  return {
    ...profile,
    effects: { ...profile.effects, grain: false, switchTear: false },
  };
}

/**
 * The profile every surface keeps.
 *
 * It does not read the viewport, because the viewport does not predict the
 * load. Its two costs split cleanly:
 *
 * - **Fragment cost** is already bounded by this profile's own ceilings. Per
 *   `docs/reports/performance/setta-4-target-performance-matrix-20260724.md`
 *   section 3.1, the laptop, 4K, and 6K tiers all resolve to a capped scene
 *   pass and a 3.34–3.60 MP post pass. The ceiling now includes enough
 *   headroom for an 8.33 ms ProMotion frame; larger displays differ only in
 *   sharpness.
 * - **Vertex and instance cost** — particles per node, edge segments, field
 *   density, the visible window — scales with the graph, not with the window.
 *   A 6K viewport does not add a node.
 *
 * So viewport thresholds and live GPU-time thresholds spend fidelity to buy
 * nothing predictable. They also make the scene's halftone density stateful.
 * Performance measurement remains available in the explicit graph harness,
 * where it can report a miss without changing the thing it is measuring.
 */
export function graphStartingQualityProfile(): GraphQualityProfile {
  return graphQualityProfile;
}

export interface GraphSurfaceSizes {
  /** The dither/post pass, run near display resolution. */
  readonly postWidth: number;
  readonly postHeight: number;
  /** The particle/edge pass; capped, then upsampled by the post pass. */
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

/** Resolves both pass sizes for a viewport and the fixed profile. */
export function graphSurfaceSizes(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  profile: GraphQualityProfile,
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
  return {
    postWidth: post.w,
    postHeight: post.h,
    sceneWidth: capped.w,
    sceneHeight: capped.h,
    scenePixelScale: capped.w / width,
  };
}

/**
 * Halftone cell size on the post surface.
 *
 * The authored cell is in CSS pixels so the dots stay a constant size on
 * screen, but the post surface is capped: at a 4K or 6K viewport it holds far
 * fewer device pixels than CSS pixels, and the cell shrinks with it. The
 * mockup's 1.6-pixel floor keeps the halftone stable at those capped sizes.
 */
const minimumDitherSurfacePixels = 1.6;

export function graphDitherCellPixels(
  ditherPixel: number,
  postWidth: number,
  cssWidth: number,
): number {
  const surfacePixels = ditherPixel * (postWidth / Math.max(1, cssWidth));
  return Math.max(minimumDitherSurfacePixels, surfacePixels);
}
