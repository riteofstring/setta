/**
 * Exhaustive visual catalog for Go-owned Director semantic graph contracts.
 *
 * This is the one place generated backend semantic values become renderer
 * vocabulary. The packed snapshot still carries only numeric visual codes; the
 * semantic strings stay at this boundary and every mapping is checked by
 * TypeScript against the generated union types.
 */

import type {
  EvidenceClass,
  SemanticEdgeKind,
  SemanticNodeKind,
  SemanticNodeStatus,
} from "@generated/backend";

import type {
  PackedGraphEdgeChannel,
  PackedGraphEmphasis,
  PackedGraphGlyph,
  PackedGraphLabelPlacement,
  PackedGraphMode,
  PackedGraphRole,
} from "./packed-graph-vocabulary";

interface SemanticNodeKindVisual {
  readonly mode: PackedGraphMode;
  readonly glyph: PackedGraphGlyph;
  readonly role: PackedGraphRole;
  readonly labelPlacement: PackedGraphLabelPlacement;
}

export const semanticNodeKindVisuals = {
  user_goal: {
    mode: "listening",
    glyph: "microphone",
    role: "input",
    labelPlacement: "below",
  },
  director_decision: {
    mode: "think",
    glyph: "dot",
    role: "step",
    labelPlacement: "below",
  },
  plan: {
    mode: "think",
    glyph: "document",
    role: "step",
    labelPlacement: "below",
  },
  milestone: {
    mode: "merge",
    glyph: "synthesis",
    role: "step",
    labelPlacement: "below",
  },
  delegation: {
    mode: "merge",
    glyph: "dot",
    role: "step",
    labelPlacement: "below",
  },
  investigation: {
    mode: "think",
    glyph: "search",
    role: "step",
    labelPlacement: "below",
  },
  action: {
    mode: "do",
    glyph: "terminal",
    role: "step",
    labelPlacement: "below",
  },
  resource_required: {
    mode: "risk",
    glyph: "warning",
    role: "step",
    labelPlacement: "below",
  },
  approval_required: {
    mode: "risk",
    glyph: "warning",
    role: "step",
    labelPlacement: "below",
  },
  artifact: {
    mode: "success",
    glyph: "document",
    role: "step",
    labelPlacement: "over",
  },
  validation: {
    mode: "success",
    glyph: "check",
    role: "step",
    labelPlacement: "below",
  },
  blocked: {
    mode: "risk",
    glyph: "warning",
    role: "step",
    labelPlacement: "below",
  },
  retry: {
    mode: "risk",
    glyph: "dot",
    role: "step",
    labelPlacement: "below",
  },
  recovery: {
    mode: "merge",
    glyph: "synthesis",
    role: "step",
    labelPlacement: "below",
  },
  completed: {
    mode: "success",
    glyph: "check",
    role: "outcome",
    labelPlacement: "over",
  },
  failed: {
    mode: "fail",
    glyph: "cross",
    role: "outcome",
    labelPlacement: "below",
  },
  cancelled: {
    mode: "risk",
    glyph: "warning",
    role: "outcome",
    labelPlacement: "below",
  },
} satisfies Record<SemanticNodeKind, SemanticNodeKindVisual>;

const semanticStatusModes = {
  pending: "think",
  active: "do",
  waiting: "risk",
  succeeded: "success",
  failed: "fail",
  cancelled: "risk",
} satisfies Record<SemanticNodeStatus, PackedGraphMode>;

export const semanticStatusOutcomes = {
  pending: "running",
  active: "running",
  waiting: "running",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
} as const satisfies Record<SemanticNodeStatus, "running" | "succeeded" | "failed" | "cancelled">;

export const semanticEvidenceEmphases = {
  runtime_fact: "fact",
  structured_declaration: "declared",
  director_interpretation: "interpreted",
} satisfies Record<EvidenceClass, PackedGraphEmphasis>;

export const semanticEdgeChannels = {
  followed_by: "flow",
  delegated_to: "branch",
  depends_on: "branch",
  blocked_by: "branch",
  produced: "merge",
  validated_by: "merge",
  recovered_by: "merge",
} satisfies Record<SemanticEdgeKind, PackedGraphEdgeChannel>;

const semanticEdgeModes = {
  followed_by: "think",
  delegated_to: "merge",
  depends_on: "risk",
  blocked_by: "risk",
  produced: "success",
  validated_by: "success",
  recovered_by: "risk",
} satisfies Record<SemanticEdgeKind, PackedGraphMode>;

export function semanticNodeMode(
  kind: SemanticNodeKind,
  status: SemanticNodeStatus,
): PackedGraphMode {
  if (status === "waiting" || status === "failed" || status === "cancelled") {
    return semanticStatusModes[status];
  }
  if (status === "active" && kind !== "user_goal" && kind !== "director_decision") {
    return semanticStatusModes[status];
  }
  return semanticNodeKindVisuals[kind].mode;
}

export function semanticEdgeMode(
  kind: SemanticEdgeKind,
  childMode: PackedGraphMode,
): PackedGraphMode {
  if (kind === "followed_by") {
    return childMode;
  }
  return semanticEdgeModes[kind];
}
