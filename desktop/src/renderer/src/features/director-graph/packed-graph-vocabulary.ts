/**
 * Visual vocabulary of the packed GPU render snapshot.
 *
 * These codes are the renderer's own vocabulary, not Setta contract values. The
 * packed snapshot deliberately carries no semantic strings: `internal/director`
 * owns semantic node kinds, statuses, evidence classes, and edge kinds, and the
 * exhaustive mapping from those contract values onto this vocabulary belongs to
 * the visual catalog that lands once the Director endpoints make the generated
 * TypeScript contracts reachable. Keeping the two apart is what lets the graph
 * canvas be built, measured, and profiled before any production state exists,
 * without a hand-maintained contract mirror.
 *
 * Every list here is the complete inventory for its axis, so a `satisfies`
 * mapping over one of these unions turns an unhandled visual into a compile
 * error instead of a generic fallback.
 */

import { stripInlineMarkdown } from "@renderer/lib/plain-inline-text";

function codeTable<Value extends string>(
  values: readonly Value[],
): Readonly<Record<Value, number>> {
  const table = {} as Record<Value, number>;
  for (const [index, value] of values.entries()) {
    table[value] = index;
  }
  return Object.freeze(table);
}

/**
 * The mockup's seven-way colour language. `risk` replaces the prototype's
 * `struggle`/`struggling` naming: the amber visual survives, the subjective
 * label does not.
 */
export const packedGraphModes = [
  "think",
  "do",
  "risk",
  "success",
  "fail",
  "merge",
  "listening",
] as const;
export type PackedGraphMode = (typeof packedGraphModes)[number];
export const packedGraphModeCode = codeTable(packedGraphModes);

/**
 * The glyph atlas inventory. Glyph selection is a typed decision made by the
 * packer; the prototype's keyword matching over label text is forbidden.
 */
export const packedGraphGlyphs = [
  "read",
  "terminal",
  "edit",
  "measure",
  "warning",
  "check",
  "cross",
  "synthesis",
  "search",
  "document",
  "dot",
  "microphone",
] as const;
export type PackedGraphGlyph = (typeof packedGraphGlyphs)[number];
export const packedGraphGlyphCode = codeTable(packedGraphGlyphs);

/** Structural position of a node inside its turn's ladder. */
export const packedGraphRoles = ["input", "step", "outcome"] as const;
export type PackedGraphRole = (typeof packedGraphRoles)[number];
export const packedGraphRoleCode = codeTable(packedGraphRoles);

/**
 * How strongly a node asserts itself. An interpretation must stay visually
 * distinguishable from a runtime fact, so emphasis is a packed column rather
 * than a renderer guess.
 */
export const packedGraphEmphases = ["fact", "declared", "interpreted"] as const;
export type PackedGraphEmphasis = (typeof packedGraphEmphases)[number];
export const packedGraphEmphasisCode = codeTable(packedGraphEmphases);

/**
 * Level-of-detail bucket. This is history compaction only — distance from the
 * live edge is camera-relative view state and never enters the snapshot.
 */
export const packedGraphDetails = ["detailed", "compacted"] as const;
export type PackedGraphDetail = (typeof packedGraphDetails)[number];
export const packedGraphDetailCode = codeTable(packedGraphDetails);

/** How an edge is routed. Semantic edge kinds map onto these three beams. */
export const packedGraphEdgeChannels = ["flow", "branch", "merge"] as const;
export type PackedGraphEdgeChannel = (typeof packedGraphEdgeChannels)[number];
export const packedGraphEdgeChannelCode = codeTable(packedGraphEdgeChannels);

/** Terminal state of one turn's ladder. */
export const packedGraphOutcomes = ["running", "succeeded", "failed", "cancelled"] as const;
export type PackedGraphOutcome = (typeof packedGraphOutcomes)[number];
export const packedGraphOutcomeCode = codeTable(packedGraphOutcomes);

/**
 * Where the DOM label layer anchors a node's label. Success outcomes sit over
 * the node and failures below it so the eclipsed node stays visible.
 */
export const packedGraphLabelPlacements = ["none", "below", "over"] as const;
export type PackedGraphLabelPlacement = (typeof packedGraphLabelPlacements)[number];
export const packedGraphLabelPlacementCode = codeTable(packedGraphLabelPlacements);

/**
 * Bounds the snapshot can never exceed. The column widths depend on them:
 * turn indices and rows are packed as `Uint16`, node references as `Uint32`.
 */
export const packedGraphLimits = {
  maxNodes: 65535,
  maxEdges: 262143,
  maxTurns: 4096,
  maxRowsPerTurn: 65535,
  /**
   * Canvas-adjacent text budget. Two bounded lines at the mockup's 260–320 px
   * label width; the full public summary lives in the DOM detail surface.
   */
  maxLabelCharacters: 96,
} as const;

/**
 * `Number.POSITIVE_INFINITY` is the packed "never" for a time column, so a
 * shader comparison such as `time < terminalAt` needs no sentinel constant.
 */
export const packedGraphNever = Number.POSITIVE_INFINITY;

export interface BoundedGraphLabel {
  readonly text: string;
  readonly truncated: boolean;
}

/**
 * Bounds one label for the canvas layer. Real public summaries are longer than
 * the prototype's mock text, so bounding is the product rule rather than an
 * assumption that upstream text already fits; `truncated` lets the DOM layer
 * offer the full text. Inline markdown markers are dropped: a pill is a plain
 * line, and `**title**` in one is formatting displayed as content.
 */
export function boundGraphLabel(label: string): BoundedGraphLabel {
  const collapsed = stripInlineMarkdown(label).trim().replace(/\s+/gu, " ");
  const characters = Array.from(collapsed);
  if (characters.length <= packedGraphLimits.maxLabelCharacters) {
    return { text: collapsed, truncated: false };
  }
  const kept = characters
    .slice(0, packedGraphLimits.maxLabelCharacters - 1)
    .join("")
    .trimEnd();
  return { text: `${kept}…`, truncated: true };
}

/**
 * Reads one packed column value. `noUncheckedIndexedAccess` widens every typed
 * array read to `number | undefined`; this narrows it once, loudly, instead of
 * scattering non-null assertions across the renderer.
 */
export function packedValueAt(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`packed column index ${index} is out of range (length ${values.length})`);
  }
  return value;
}
