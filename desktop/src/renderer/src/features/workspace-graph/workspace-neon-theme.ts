import type {
  SemanticActivityInterval,
  SemanticEdgeKind,
  SemanticNodeKind,
  WorkflowGraphEdgeStatus,
  WorkflowGraphNodeStatus,
  WorkflowNodeKind,
} from "@generated/backend";

type EdgeStrokeStyle = {
  alpha: number;
  color: number;
  glowAlpha: number;
  glowWidth: number;
  width: number;
};

const workflowStatusColors = {
  not_started: 0x52525b,
  pending: 0xa78bfa,
  ready: 0x38bdf8,
  running: 0x14b8a6,
  succeeded: 0x22c55e,
  failed: 0xef4444,
  cancelled: 0x71717a,
  waiting_approval: 0xf59e0b,
  recovery_required: 0xdc2626,
} satisfies Record<WorkflowGraphNodeStatus, number>;

const workflowKindColors = {
  action: 0x64748b,
  end: 0x475569,
  "gateway.and": 0x8b5cf6,
  "gateway.or": 0x8b5cf6,
  "gateway.xor": 0x8b5cf6,
  "loop.guard": 0xf97316,
  start: 0x0f766e,
} satisfies Record<WorkflowNodeKind, number>;

const workflowEdgeStatusStyles = {
  inactive: {
    alpha: 0.34,
    color: 0x164e63,
    glowAlpha: 0.08,
    glowWidth: 6.5,
    width: 1.8,
  },
  active: {
    alpha: 0.88,
    color: 0x22d3ee,
    glowAlpha: 0.28,
    glowWidth: 8.5,
    width: 2.8,
  },
  completed: {
    alpha: 0.78,
    color: 0x22c55e,
    glowAlpha: 0.18,
    glowWidth: 7.5,
    width: 2.4,
  },
  cancelled: {
    alpha: 0.28,
    color: 0x71717a,
    glowAlpha: 0.06,
    glowWidth: 5.5,
    width: 1.6,
  },
} satisfies Record<WorkflowGraphEdgeStatus, EdgeStrokeStyle>;

const semanticKindColors = {
  concept: 0x0f766e,
  question: 0x2563eb,
  hypothesis: 0x9333ea,
  finding: 0x16a34a,
  decision: 0xd97706,
  constraint: 0xdc2626,
} satisfies Record<SemanticNodeKind, number>;

const semanticEdgeKindColors = {
  about: 0x7dd3fc,
  touches: 0x5eead4,
  supports: 0x86efac,
  refutes: 0xfda4af,
  resolves: 0xfcd34d,
  constrains: 0xf87171,
  related_to: 0xc4b5fd,
} satisfies Record<SemanticEdgeKind, number>;

const semanticActivityColors = {
  blocked: 0xfb7185,
  debugging: 0xfbbf24,
  editing: 0x2dd4bf,
  exploring: 0x38bdf8,
  validating: 0x22c55e,
} satisfies Record<SemanticActivityInterval["kind"], number>;

export const workspaceNeonTheme = {
  foundation: {
    background: 0x07080d,
    grid: {
      coarse: {
        alpha: 0.22,
        color: 0x22d3ee,
        step: 240,
        width: 1.4,
      },
      extent: 2400,
      fine: {
        alpha: 0.12,
        color: 0x0e7490,
        step: 48,
        width: 1,
      },
    },
    marquee: {
      fillAlpha: 0.12,
      fillColor: 0x0e7490,
      strokeAlpha: 0.92,
      strokeColor: 0x67e8f9,
      strokeWidth: 2,
    },
    port: {
      core: 0xe0f2fe,
      source: 0x22d3ee,
      target: 0xc084fc,
    },
    selection: {
      hovered: {
        alpha: 0.54,
        color: 0x67e8f9,
        inset: 5,
        radius: 12,
        width: 2,
      },
      selected: {
        alpha: 0.96,
        color: 0xa5f3fc,
        inset: 5,
        radius: 12,
        width: 3,
      },
    },
    temporaryEdge: {
      alpha: 0.95,
      color: 0x22d3ee,
      endpointAlpha: 0.92,
      endpointRadius: 5.5,
      glowAlpha: 0.28,
      glowWidth: 8,
      width: 3.2,
    },
    vignette: {
      centerColor: "rgba(0, 0, 0, 0)",
      edgeColor: "rgba(0, 0, 0, 0.68)",
      midColor: "rgba(0, 0, 0, 0.18)",
    },
  },
  semantic: {
    activity: semanticActivityColors,
    dismissedColor: 0x52525b,
    edgeKind: semanticEdgeKindColors,
    kind: semanticKindColors,
    promotedColor: 0x0891b2,
  },
  workflow: {
    defaultAccent: 0x38bdf8,
    edgeCoreColor: 0xecfeff,
    edgeStatus: workflowEdgeStatusStyles,
    glass: {
      bodyBottom: 0x080b14,
      bodyTop: 0x101827,
      highlightAlpha: 0.1,
      highlightColor: 0xe0f2fe,
      radius: 8,
      shadowAlpha: 0.32,
      shadowColor: 0x020617,
      shadowOffsetX: 8,
      shadowOffsetY: 10,
      strokeAlpha: 0.9,
      strokeWidth: 2,
    },
    glow: {
      alpha: 0.18,
      ringAlpha: 0.13,
      ringWidth: 2,
      radiusPadding: 28,
    },
    kind: workflowKindColors,
    status: workflowStatusColors,
  },
} as const;

export const workflowNodeStatusValues = Object.keys(
  workspaceNeonTheme.workflow.status,
) as WorkflowGraphNodeStatus[];

export const workflowEdgeStatusValues = Object.keys(
  workspaceNeonTheme.workflow.edgeStatus,
) as WorkflowGraphEdgeStatus[];

export const workflowNodeKindValues = Object.keys(
  workspaceNeonTheme.workflow.kind,
) as WorkflowNodeKind[];

export const semanticNodeKindValues = Object.keys(
  workspaceNeonTheme.semantic.kind,
) as SemanticNodeKind[];

export const semanticEdgeKindValues = Object.keys(
  workspaceNeonTheme.semantic.edgeKind,
) as SemanticEdgeKind[];

export function workflowNodeAccentColor(
  status: WorkflowGraphNodeStatus | undefined,
  kind: WorkflowNodeKind | undefined,
) {
  if (status === "not_started" && kind !== undefined) {
    return workspaceNeonTheme.workflow.kind[kind];
  }
  if (status !== undefined) {
    return workspaceNeonTheme.workflow.status[status];
  }
  if (kind !== undefined) {
    return workspaceNeonTheme.workflow.kind[kind];
  }
  return workspaceNeonTheme.workflow.defaultAccent;
}

export function workflowEdgeStrokeStyle(
  status: WorkflowGraphEdgeStatus | undefined,
): EdgeStrokeStyle {
  return status === undefined
    ? workspaceNeonTheme.workflow.edgeStatus.inactive
    : workspaceNeonTheme.workflow.edgeStatus[status];
}

export function semanticNodeColor({
  dismissed,
  kind,
  promoted,
}: {
  dismissed: boolean;
  kind: SemanticNodeKind;
  promoted: boolean;
}) {
  if (dismissed) {
    return workspaceNeonTheme.semantic.dismissedColor;
  }
  if (promoted) {
    return workspaceNeonTheme.semantic.promotedColor;
  }
  return workspaceNeonTheme.semantic.kind[kind];
}
