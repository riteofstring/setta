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

type WorkflowNodeAuraStyle = {
  animate: boolean;
  baseAlpha: number;
  baseRingAlpha: number;
  glowWidth: number;
  mode: "breathing" | "flicker" | "idle" | "inert" | "settled";
  periodMs: number;
  pulseAlpha: number;
  pulseRadius: number;
  radiusPadding: number;
  ringWidth: number;
  steadyAlpha: number;
  steadyRingAlpha: number;
};

const workflowStatusColors = {
  not_started: 0x94a3b8,
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
  action: 0x38bdf8,
  end: 0x7dd3fc,
  "gateway.and": 0xc084fc,
  "gateway.or": 0xc084fc,
  "gateway.xor": 0xc084fc,
  "loop.guard": 0xfb923c,
  start: 0x2dd4bf,
} satisfies Record<WorkflowNodeKind, number>;

const workflowEdgeStatusStyles = {
  inactive: {
    alpha: 0.42,
    color: 0x38bdf8,
    glowAlpha: 0.14,
    glowWidth: 8,
    width: 2,
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

const workflowNodeAuraStyles = {
  not_started: {
    animate: false,
    baseAlpha: 0.16,
    baseRingAlpha: 0.085,
    glowWidth: 8.5,
    mode: "idle",
    periodMs: 2400,
    pulseAlpha: 0,
    pulseRadius: 0,
    radiusPadding: 25,
    ringWidth: 1.8,
    steadyAlpha: 0.18,
    steadyRingAlpha: 0.11,
  },
  pending: {
    animate: true,
    baseAlpha: 0.11,
    baseRingAlpha: 0.06,
    glowWidth: 7,
    mode: "breathing",
    periodMs: 1900,
    pulseAlpha: 0.1,
    pulseRadius: 9,
    radiusPadding: 24,
    ringWidth: 2,
    steadyAlpha: 0.22,
    steadyRingAlpha: 0.15,
  },
  ready: {
    animate: true,
    baseAlpha: 0.13,
    baseRingAlpha: 0.07,
    glowWidth: 8,
    mode: "breathing",
    periodMs: 1600,
    pulseAlpha: 0.11,
    pulseRadius: 10,
    radiusPadding: 25,
    ringWidth: 2,
    steadyAlpha: 0.24,
    steadyRingAlpha: 0.16,
  },
  running: {
    animate: true,
    baseAlpha: 0.16,
    baseRingAlpha: 0.09,
    glowWidth: 9,
    mode: "breathing",
    periodMs: 1250,
    pulseAlpha: 0.14,
    pulseRadius: 13,
    radiusPadding: 27,
    ringWidth: 2.2,
    steadyAlpha: 0.28,
    steadyRingAlpha: 0.19,
  },
  succeeded: {
    animate: false,
    baseAlpha: 0.13,
    baseRingAlpha: 0.09,
    glowWidth: 6.5,
    mode: "settled",
    periodMs: 2400,
    pulseAlpha: 0,
    pulseRadius: 0,
    radiusPadding: 24,
    ringWidth: 1.7,
    steadyAlpha: 0.16,
    steadyRingAlpha: 0.11,
  },
  failed: {
    animate: true,
    baseAlpha: 0.18,
    baseRingAlpha: 0.12,
    glowWidth: 10,
    mode: "flicker",
    periodMs: 520,
    pulseAlpha: 0.18,
    pulseRadius: 10,
    radiusPadding: 28,
    ringWidth: 2.5,
    steadyAlpha: 0.34,
    steadyRingAlpha: 0.24,
  },
  cancelled: {
    animate: false,
    baseAlpha: 0.025,
    baseRingAlpha: 0.012,
    glowWidth: 4,
    mode: "inert",
    periodMs: 2400,
    pulseAlpha: 0,
    pulseRadius: 0,
    radiusPadding: 18,
    ringWidth: 1.2,
    steadyAlpha: 0.035,
    steadyRingAlpha: 0.018,
  },
  waiting_approval: {
    animate: true,
    baseAlpha: 0.14,
    baseRingAlpha: 0.08,
    glowWidth: 8.5,
    mode: "breathing",
    periodMs: 1500,
    pulseAlpha: 0.12,
    pulseRadius: 11,
    radiusPadding: 25,
    ringWidth: 2.1,
    steadyAlpha: 0.27,
    steadyRingAlpha: 0.18,
  },
  recovery_required: {
    animate: true,
    baseAlpha: 0.2,
    baseRingAlpha: 0.14,
    glowWidth: 11,
    mode: "flicker",
    periodMs: 430,
    pulseAlpha: 0.22,
    pulseRadius: 12,
    radiusPadding: 30,
    ringWidth: 2.7,
    steadyAlpha: 0.38,
    steadyRingAlpha: 0.28,
  },
} satisfies Record<WorkflowGraphNodeStatus, WorkflowNodeAuraStyle>;

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
    animation: {
      activeCellCap: 96,
      activeTendrilCap: 160,
      breath: {
        amplitude: 0.024,
        periodMs: 2600,
      },
      nucleus: {
        coreAlpha: 0.92,
        coreRadiusRatio: 0.1,
        driftRadius: 3.4,
        ringAlpha: 0.86,
        ringRadiusRatio: 0.24,
        ringWidth: 1.5,
        periodMs: 4300,
      },
      organelle: {
        alpha: 0.7,
        count: 5,
        jitterRadius: 2.4,
        periodMs: 1900,
        radiusRatio: 0.042,
      },
      shimmer: {
        beadAlpha: 0.98,
        beadRadius: 3.4,
        haloAlpha: 0.2,
        haloRadius: 8.5,
        orbitGap: 7,
        periodMs: 2100,
        ringAlpha: 0.34,
        ringWidth: 1.3,
      },
      tendril: {
        filamentAlpha: 0.46,
        filamentWidth: 1.5,
        periodMs: 5200,
        signalAlpha: 0.84,
        signalHaloAlpha: 0.22,
        signalHaloRadius: 7.5,
        signalPeriodMs: 6800,
        signalRadius: 3.2,
        signalSamples: 5,
        signalTrailAlpha: 0.54,
        signalTrailLength: 0.14,
        signalTrailWidth: 3.4,
        wobbleAmplitude: 4.4,
      },
    },
    activity: semanticActivityColors,
    cell: {
      auraAlpha: 0.18,
      auraWidth: 7,
      cytoplasmAlpha: 0.94,
      cytoplasmColor: 0x07111a,
      dismissed: {
        auraAlpha: 0.055,
        cytoplasmAlpha: 0.72,
        innerTintAlpha: 0.045,
        membraneAlpha: 0.38,
        membraneWidth: 1.7,
        nucleusAlpha: 0.28,
        organelleAlpha: 0.18,
      },
      innerTintAlpha: 0.13,
      labelGapScreenPx: 8,
      membraneAlpha: 0.88,
      membraneRadiusInset: 6,
      membraneWidth: 2.4,
      nucleusAlpha: 0.84,
      organelleAlpha: 0.54,
      promoted: {
        auraAlpha: 0.26,
        innerTintAlpha: 0.18,
        membraneAlpha: 0.98,
        membraneWidth: 3.2,
        nucleusAlpha: 0.95,
        organelleAlpha: 0.68,
      },
    },
    dismissedColor: 0x52525b,
    edgeKind: semanticEdgeKindColors,
    kind: semanticKindColors,
    promotedColor: 0x0891b2,
    tendril: {
      coreAlpha: 0.46,
      coreColor: 0xecfeff,
      coreWidth: 1.1,
      filamentAlpha: 0.48,
      filamentSamples: 8,
      filamentWidth: 1.4,
      glowAlpha: 0.16,
      glowWidth: 7,
      strokeAlpha: 0.72,
      width: 2.4,
      wobbleAmplitude: 5.5,
    },
  },
  workflow: {
    defaultAccent: 0x38bdf8,
    edgeCoreColor: 0xecfeff,
    edgeFlow: {
      color: 0x22d3ee,
      coreColor: 0xecfeff,
      headAlpha: 0.96,
      headRadius: 3.7,
      haloAlpha: 0.2,
      haloRadius: 8.5,
      periodMs: 1800,
      pulseCount: 2,
      trailAlpha: 0.74,
      trailLength: 0.16,
      trailSamples: 6,
      trailWidth: 4.2,
    },
    edgeStatus: workflowEdgeStatusStyles,
    glass: {
      bodyBottom: 0x0a1020,
      bodyTop: 0x16233a,
      highlightAlpha: 0.18,
      highlightColor: 0xe0f2fe,
      radius: 8,
      shadowAlpha: 0.42,
      shadowColor: 0x020617,
      shadowOffsetX: 8,
      shadowOffsetY: 10,
      strokeAlpha: 0.98,
      strokeWidth: 2.5,
    },
    glow: {
      alpha: 0.18,
      ringAlpha: 0.13,
      ringWidth: 2,
      radiusPadding: 28,
    },
    kind: workflowKindColors,
    nodeAura: workflowNodeAuraStyles,
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
