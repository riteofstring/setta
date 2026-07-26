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
  packedGraphEdgeChannels,
  packedGraphEmphases,
  packedGraphModes,
  packedGraphRoles,
  type PackedGraphDetail,
  type PackedGraphEdgeChannel,
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
 * How an edge is routed. `bow` is the lateral offset at the midpoint in
 * reference-frame clip units: a branch leaves the spine, a merge converges onto
 * it, and ordinary flow runs straight.
 */
interface GraphEdgeChannelVisual {
  readonly widthScale: number;
  readonly bow: number;
}

const graphEdgeChannelVisual = {
  flow: { widthScale: 1.0, bow: 0.0 },
  branch: { widthScale: 0.82, bow: 0.055 },
  merge: { widthScale: 0.9, bow: -0.045 },
} satisfies Record<PackedGraphEdgeChannel, GraphEdgeChannelVisual>;

/**
 * The authored reference frame. Layout is written for an 800×1024 portrait
 * frame and letterboxed into the window, so graph shape and on-screen node size
 * stay put instead of stretching (mockup lines 274–285).
 */
export const graphReferenceFrame = {
  width: 800,
  height: 1024,
  /** Caps growth on large displays: 4K and 6K show more context, not bigger nodes. */
  maxFit: 1.1,
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
 * Node geometry in reference points, before the fit multiplier. `working` is
 * the envelope between a node's birth and the moment it produced its next
 * fact; `recent` decays with distance behind the live edge.
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
  /** vec2(widthScale, bow) */
  edgeChannel: flatten(
    packedGraphEdgeChannels,
    (channel) => [graphEdgeChannelVisual[channel].widthScale, graphEdgeChannelVisual[channel].bow],
    2,
  ),
} as const;

export interface GraphFitFrame {
  /** Authored graph clip X multiplied by this lands in window clip X. */
  readonly fitX: number;
  readonly fitY: number;
  /** Node and glyph size multiplier for this viewport. */
  readonly size: number;
}

/**
 * Letterboxes the reference frame into a viewport. "Contain", never past
 * `maxFit`, so a 6K display shows more graph rather than a magnified one.
 */
export function graphFitFrame(viewportWidth: number, viewportHeight: number): GraphFitFrame {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const fit = Math.min(
    graphReferenceFrame.maxFit,
    width / graphReferenceFrame.width,
    height / graphReferenceFrame.height,
  );
  return {
    fitX: (graphReferenceFrame.width * fit) / width,
    fitY: (graphReferenceFrame.height * fit) / height,
    size: fit,
  };
}

/**
 * Applies the shader's barrel curvature to a screen point. Labels, reticles,
 * and pointer hit-tests all go through this so they land on the warped node
 * rather than on where an unwarped projection would have put it.
 */
export function graphWarpToScreen(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): { readonly x: number; readonly y: number } {
  const centeredX = x / Math.max(1, viewportWidth) - 0.5;
  const centeredY = y / Math.max(1, viewportHeight) - 0.5;
  const factor = 1 / (1 + (centeredX * centeredX + centeredY * centeredY) * graphBarrel);
  return {
    x: (centeredX * factor + 0.5) * viewportWidth,
    y: (centeredY * factor + 0.5) * viewportHeight,
  };
}
