/**
 * The mockup's visual language, expressed over the packed vocabulary.
 *
 * Every table here is an exhaustive `satisfies` mapping over one axis of
 * `packed-graph-vocabulary`. Adding a value to that vocabulary without deciding
 * how it draws is a compile error, which is what the plan means by "exhaustive
 * mappings ... so adding a contract value cannot silently fall through to a
 * generic visual". The shaders never branch on a semantic value: each table is
 * uploaded as a small uniform array and indexed by the packed code, so the
 * decision lives in TypeScript where the exhaustiveness check can see it.
 *
 * The numbers reproduce `docs/mockups/fullscreen_conversation_concept.html`.
 * Where the mockup inferred a visual from prototype-only data — its `struggle`
 * mode, its keyword glyph matching, its "listening node is bigger" rule keyed
 * on mode — the production rule reads a typed packed column instead.
 */

import {
  packedGraphDetails,
  packedGraphEmphases,
  packedGraphModes,
  packedGraphRoles,
  type PackedGraphDetail,
  type PackedGraphEmphasis,
  type PackedGraphMode,
  type PackedGraphRole,
} from "../packed-graph-vocabulary";

export type GraphRgb = readonly [number, number, number];

/**
 * The mockup's seven-way colour language (mockup lines 269–271, 433–441).
 * `risk` carries what the prototype called `struggle`; the amber survives and
 * the subjective label does not.
 */
export const graphModeColor = {
  think: [0.3, 0.8, 0.95],
  do: [0.62, 0.45, 1.0],
  risk: [1.0, 0.79, 0.26],
  success: [0.36, 0.96, 0.63],
  fail: [1.0, 0.29, 0.37],
  merge: [0.78, 0.95, 1.0],
  listening: [0.72, 0.9, 1.0],
} satisfies Record<PackedGraphMode, GraphRgb>;

/** Tints of the drifting particle medium the graph floats in. */
export const graphFieldTint = {
  near: [0.3, 0.8, 0.95],
  far: [0.62, 0.45, 1.0],
} satisfies Record<"near" | "far", GraphRgb>;

/**
 * The ambient field's authored density.
 *
 * The 800×800 view is the visual reference. Larger windows keep that density
 * around the centre and let particles become gradually scarcer toward the
 * perimeter, like a lit volume receding into an unbounded dark space. The
 * particle count stays fixed, so a resize changes neither GPU allocation nor
 * the deterministic seed sequence.
 */
export const graphFieldGeometry = {
  referenceWidth: 800,
  referenceHeight: 800,
  outerSpreadExponent: 3,
  edgeFadeStrength: 0.62,
} as const;

/**
 * Smaller windows draw a deterministic prefix of the fixed field buffer so
 * particles per CSS pixel stay at the 800×800 reference density. Larger
 * windows keep the full buffer and use the centre-weighted spread in the
 * shader; neither path reallocates or reseeds on resize.
 */
export function graphFieldDrawCount(
  available: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const referenceArea = graphFieldGeometry.referenceWidth * graphFieldGeometry.referenceHeight;
  const viewportArea = Math.max(1, viewportWidth) * Math.max(1, viewportHeight);
  return Math.max(1, Math.round(available * Math.min(1, viewportArea / referenceArea)));
}

/**
 * How a node's structural position sizes it. The mockup made its input node
 * large by testing `mode >= listening`; role is the typed column that actually
 * means "this is the turn's input", so production reads that instead.
 */
interface GraphRoleVisual {
  /** Added to the body diameter in reference points. */
  readonly bodyBonus: number;
  /** Scales the glyph drawn inside the body. */
  readonly glyphScale: number;
  /** Scales the node's particle budget; an outcome needs fewer sparks. */
  readonly particleScale: number;
}

const graphRoleVisual = {
  input: { bodyBonus: 46, glyphScale: 1.15, particleScale: 0.75 },
  step: { bodyBonus: 0, glyphScale: 1.0, particleScale: 1.0 },
  outcome: { bodyBonus: 12, glyphScale: 1.1, particleScale: 1.0 },
} satisfies Record<PackedGraphRole, GraphRoleVisual>;

/**
 * How strongly a node asserts itself. The plan requires interpretations to stay
 * visibly distinguishable from runtime facts, so this is a drawn difference
 * rather than a tooltip: a declared node carries a closed bracket ring, an
 * interpretation carries a dashed corona and a hollow body.
 */
interface GraphEmphasisVisual {
  /** Ring thickness as a fraction of the body radius; 0 draws no ring. */
  readonly ringWidth: number;
  /** Dash count around the ring; 0 is a continuous ring. */
  readonly ringDashes: number;
  /** Body fill opacity. An interpretation reads hollow. */
  readonly bodyAlpha: number;
}

const graphEmphasisVisual = {
  fact: { ringWidth: 0, ringDashes: 0, bodyAlpha: 1.0 },
  declared: { ringWidth: 0.14, ringDashes: 0, bodyAlpha: 0.92 },
  interpreted: { ringWidth: 0.18, ringDashes: 7, bodyAlpha: 0.42 },
} satisfies Record<PackedGraphEmphasis, GraphEmphasisVisual>;

/**
 * History compaction. Compacted rows are read as shape rather than as
 * sentences, so they shrink and dim but keep their glyph and their colour.
 */
interface GraphDetailVisual {
  readonly sizeScale: number;
  readonly brightness: number;
  readonly particleScale: number;
}

const graphDetailVisual = {
  detailed: { sizeScale: 1.0, brightness: 1.0, particleScale: 1.0 },
  compacted: { sizeScale: 0.72, brightness: 0.68, particleScale: 0.34 },
} satisfies Record<PackedGraphDetail, GraphDetailVisual>;

/**
 * The authored reference frame. One world unit always maps through this fixed
 * CSS-pixel frame: resizing changes how much graph is visible, never the size
 * of a node, glyph, edge interval, or ladder step.
 */
export const graphReferenceFrame = {
  width: 800,
  height: 1024,
} as const;

/**
 * Turn-ladder spacing in reference-frame clip units. A row is one committed
 * fact; the outcome node sits a little below the last row so its pill clears
 * the row above it (mockup `STEP`, `RESP_H`, `TURN_GAP`, `COLLAPSE_GAP`).
 */
export const graphLadderSpacing = {
  rowStep: 0.2,
  outcomeGap: 0.14,
  /** Gap after a folded turn: tight enough for a readable ladder. */
  foldedGap: 0.18,
  /** Gap after an expanded turn. */
  openGap: 0.42,
} as const;

/**
 * Node geometry in fixed reference points. `working` is the envelope between a
 * node's birth and the moment it produced its next fact; `recent` decays with
 * distance behind the live edge.
 */
export const graphNodeGeometry = {
  baseDiameter: 40,
  recentBonus: 20,
  workingBonus: 58,
  hoverBonus: 38,
  /** Converts a reference-point diameter to CSS pixels for hit-testing and labels. */
  cssDiameterScale: 0.55,
  /** Distance-behind-the-live-edge falloff for `recent`. */
  recencyFalloff: 0.85,
} as const;

/**
 * Visual hierarchy within an overview.
 *
 * Director always keeps the authored node size. A dense worker grid is
 * supporting context, so its nodes use one smaller fixed scale; because this
 * is independent of the fit frame, resizing reveals more graph without
 * enlarging or shrinking either hierarchy level.
 */
export const graphNodeHierarchyScale = {
  director: 1,
  gridSupporting: 0.62,
} as const;

/** Edge beam geometry. Confident threads draw thicker (mockup `EDGE_VS`). */
export const graphEdgeGeometry = {
  baseWidth: 0.0035,
  confidenceWidth: 1.15,
  minimumWidth: 0.85,
  /** How long a beam takes to grow from parent to child, in seconds. */
  growSeconds: 0.6,
} as const;

/**
 * CRT barrel curvature. The post pass, the glyph pass, the label layer, and the
 * hit-test all apply the same constant, which is the only reason overlays stay
 * attached to the nodes they annotate (mockup line 273).
 */
export const graphBarrel = 0.21;

/**
 * Where the graph's live edge sits vertically in clip space.
 *
 * The mockup authored -0.35 above an enclosed response card; production's
 * reply is bare text on the canvas layer, so the live edge sits a step higher
 * to keep the newest node's own label clear of the reply and the composer.
 */
export const graphLiveEdgeClipY = -0.42;

/**
 * How fast the camera eases onto the live edge, and how fast a turn folds.
 * Both are per-second rates applied as `value += (target - value) * min(1, dt * rate)`.
 */
export const graphMotionRates = {
  camera: 2.2,
  fold: 7.5,
  hover: 7.0,
} as const;

function flatten<Value extends string>(
  order: readonly Value[],
  read: (value: Value) => readonly number[],
  stride: number,
): Float32Array {
  const packed = new Float32Array(order.length * stride);
  order.forEach((value, index) => {
    const components = read(value);
    if (components.length !== stride) {
      throw new Error(`visual table entry ${value} has ${components.length} of ${stride} values`);
    }
    packed.set(components, index * stride);
  });
  return packed;
}

/**
 * The uniform payloads. Each is indexed in GLSL by the packed code, so a shader
 * reads a decision this module already made exhaustively rather than branching
 * on a value it would have to be taught about again.
 */
export const graphVisualUniforms = {
  modeColor: flatten(packedGraphModes, (mode) => graphModeColor[mode], 3),
  /** vec3(bodyBonus, glyphScale, particleScale) */
  role: flatten(
    packedGraphRoles,
    (role) => [
      graphRoleVisual[role].bodyBonus,
      graphRoleVisual[role].glyphScale,
      graphRoleVisual[role].particleScale,
    ],
    3,
  ),
  /** vec3(ringWidth, ringDashes, bodyAlpha) */
  emphasis: flatten(
    packedGraphEmphases,
    (emphasis) => [
      graphEmphasisVisual[emphasis].ringWidth,
      graphEmphasisVisual[emphasis].ringDashes,
      graphEmphasisVisual[emphasis].bodyAlpha,
    ],
    3,
  ),
  /** vec3(sizeScale, brightness, particleScale) */
  detail: flatten(
    packedGraphDetails,
    (detail) => [
      graphDetailVisual[detail].sizeScale,
      graphDetailVisual[detail].brightness,
      graphDetailVisual[detail].particleScale,
    ],
    3,
  ),
} as const;

export interface GraphFitFrame {
  /** Authored graph clip X multiplied by this lands in window clip X. */
  readonly fitX: number;
  readonly fitY: number;
}

/**
 * Projects the fixed reference frame into a viewport without zooming it.
 *
 * Dividing by the viewport here and multiplying by that same viewport in the
 * clip-to-screen transform leaves one stable CSS-pixel scale. Small windows
 * crop or repack the graph; large windows reveal more context.
 */
export function graphFitFrame(viewportWidth: number, viewportHeight: number): GraphFitFrame {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  return {
    fitX: graphReferenceFrame.width / width,
    fitY: graphReferenceFrame.height / height,
  };
}

/**
 * Applies the shader's barrel curvature to a screen point. Labels, reticles,
 * and pointer hit-tests all go through this so they land on the warped node
 * rather than on where an unwarped projection would have put it.
 *
 * The post pass warps by sampling the scene at
 * `t·barrelScale·(1 + |t|²·barrel)` for the output position `t`, so the screen
 * position of a scene point is that map's inverse. `barrelScale` keeps every
 * sample inside the source instead of reflecting it at an edge. Six fixed-
 * point iterations keep DOM labels and crisp glyphs attached to the warped
 * particle bodies to under a hundredth of a pixel.
 */
export function graphWarpToScreen(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): { readonly x: number; readonly y: number } {
  const centeredX = x / Math.max(1, viewportWidth) - 0.5;
  const centeredY = y / Math.max(1, viewportHeight) - 0.5;
  const barrelScale = 1 / (1 + graphBarrel * 0.5);
  let warpedX = centeredX / barrelScale;
  let warpedY = centeredY / barrelScale;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const radiusSquared = warpedX * warpedX + warpedY * warpedY;
    const factor = barrelScale * (1 + graphBarrel * radiusSquared);
    warpedX = centeredX / factor;
    warpedY = centeredY / factor;
  }
  return {
    x: (warpedX + 0.5) * viewportWidth,
    y: (warpedY + 0.5) * viewportHeight,
  };
}
