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
  not_started: 0x64748b,
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
    alpha: 0.225,
    color: 0x8ed0e4,
    glowAlpha: 0.08,
    glowWidth: 5.3,
    width: 2,
  },
  active: {
    alpha: 0.82,
    color: 0x8de7f4,
    glowAlpha: 0.12,
    glowWidth: 4,
    width: 2.1,
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
    baseAlpha: 0.055,
    baseRingAlpha: 0.014,
    glowWidth: 5,
    mode: "idle",
    periodMs: 2400,
    pulseAlpha: 0,
    pulseRadius: 0,
    radiusPadding: 13,
    ringWidth: 1.4,
    steadyAlpha: 0.06,
    steadyRingAlpha: 0.018,
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
    baseAlpha: 0.065,
    baseRingAlpha: 0.04,
    glowWidth: 5,
    mode: "breathing",
    periodMs: 1250,
    pulseAlpha: 0.04,
    pulseRadius: 6,
    radiusPadding: 18,
    ringWidth: 2.2,
    steadyAlpha: 0.1,
    steadyRingAlpha: 0.075,
  },
  succeeded: {
    animate: false,
    baseAlpha: 0.075,
    baseRingAlpha: 0.045,
    glowWidth: 4.5,
    mode: "settled",
    periodMs: 2400,
    pulseAlpha: 0,
    pulseRadius: 0,
    radiusPadding: 16,
    ringWidth: 1.7,
    steadyAlpha: 0.09,
    steadyRingAlpha: 0.06,
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
    background: 0x05080e,
    backdrop: {
      centerColor: "rgba(10, 14, 32, 0.13)",
      edgeColor: "rgba(4, 5, 12, 0)",
    },
    grid: {
      coarse: {
        alpha: 0.015,
        color: 0x38bdf8,
        step: 240,
        width: 1.4,
      },
      extent: 2400,
      fine: {
        alpha: 0.026,
        color: 0x164e63,
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
      edgeColor: "rgba(0, 0, 0, 0.04)",
      midColor: "rgba(0, 0, 0, 0)",
    },
    workflowOnly: {
      background: 0x05060d,
      backdrop: {
        centerColor: "rgba(21, 41, 70, 0.36)",
        edgeColor: "rgba(4, 5, 12, 0)",
        radiusRatio: 0.75,
      },
      grid: {
        coarse: {
          alpha: 0.004,
          color: 0x38bdf8,
          step: 64,
          width: 1,
        },
        extent: 2400,
        fine: {
          alpha: 0.047,
          color: 0x38bdf8,
          step: 64,
          width: 1,
        },
        fineSoft: {
          alpha: 0.049,
          color: 0x94a3b8,
          width: 2.2,
        },
      },
      topFade: {
        alpha: 1,
        heightRatio: 0.16,
      },
      bottomFade: {
        alpha: 0.9,
        heightRatio: 0.2,
      },
    },
    workflowActive: {
      background: 0x05060d,
      backdrop: {
        centerColor: "rgba(22, 44, 74, 0.38)",
        edgeColor: "rgba(4, 5, 12, 0)",
        radiusRatio: 0.75,
      },
      grid: {
        coarse: {
          alpha: 0.004,
          color: 0x38bdf8,
          step: 64,
          width: 1,
        },
        extent: 2400,
        fine: {
          alpha: 0.055,
          color: 0x38bdf8,
          step: 64,
          width: 1,
        },
        fineSoft: {
          alpha: 0.034,
          color: 0x94a3b8,
          width: 1.2,
        },
      },
      topFade: {
        alpha: 1,
        heightRatio: 0.16,
      },
      bottomFade: {
        alpha: 0.9,
        heightRatio: 0.2,
      },
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
        alpha: 0.35,
        count: 3,
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
        ringAlpha: 0.08,
        ringWidth: 0.7,
      },
      tendril: {
        filamentAlpha: 0.24,
        filamentWidth: 0.9,
        periodMs: 5200,
        signalAlpha: 0.58,
        signalHaloAlpha: 0.1,
        signalHaloRadius: 4,
        signalPeriodMs: 6800,
        signalRadius: 2.2,
        signalSamples: 5,
        signalTrailAlpha: 0.22,
        signalTrailLength: 0.08,
        signalTrailWidth: 1.5,
        wobbleAmplitude: 2.5,
      },
    },
    activity: semanticActivityColors,
    cell: {
      auraAlpha: 0.38,
      auraWidth: 5.4,
      cytoplasmAlpha: 0.86,
      cytoplasmColor: 0x0b1220,
      dismissed: {
        auraAlpha: 0.055,
        cytoplasmAlpha: 0.72,
        innerTintAlpha: 0.045,
        membraneAlpha: 0.38,
        membraneWidth: 1.7,
        nucleusAlpha: 0.28,
        organelleAlpha: 0.18,
      },
      innerTintAlpha: 0.18,
      labelGapScreenPx: 8,
      membraneAlpha: 1,
      membraneRadiusInset: 4,
      membraneWidth: 2.16,
      nucleusAlpha: 0.58,
      organelleAlpha: 0.28,
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
    fit: {
      semanticOnlyMaxZoom: 1,
    },
    kind: semanticKindColors,
    promotedColor: 0x0891b2,
    tendril: {
      coreAlpha: 0.3,
      coreColor: 0xecfeff,
      coreWidth: 0.9,
      filamentAlpha: 0.24,
      filamentSamples: 12,
      filamentWidth: 0.7,
      glowAlpha: 0.12,
      glowWidth: 8,
      strokeAlpha: 0.68,
      width: 1.72,
      wobbleAmplitude: 3.2,
    },
  },
  workflow: {
    cardLayout: {
      compact: {
        iconCenterX: 23,
        labelCenterRatio: 0.62,
        labelMinCenterX: 82,
        labelRightPadding: 42,
        maxHeight: 70,
        statusBadgeVisible: false,
      },
      regular: {
        iconCenterX: 23,
        labelCenterX: 68,
        statusBadgeVisible: true,
      },
    },
    defaultAccent: 0x38bdf8,
    edgeCoreColor: 0x7dd3fc,
    edgeFlow: {
      color: 0x7dd3fc,
      coreColor: 0xecfeff,
      headAlpha: 1,
      headRadius: 3,
      haloAlpha: 0.07,
      haloRadius: 4,
      periodMs: 1800,
      pulseCount: 3,
      trailAlpha: 0.38,
      trailLength: 0.055,
      trailSamples: 6,
      trailWidth: 1.8,
    },
    edgeStatus: workflowEdgeStatusStyles,
    glass: {
      bodyBottom: 0x0a0f19,
      bodyTop: 0x0c1220,
      highlightAlpha: 0,
      highlightColor: 0xe0f2fe,
      radius: 8,
      shadowAlpha: 0.28,
      shadowColor: 0x020617,
      shadowOffsetX: 8,
      shadowOffsetY: 10,
      strokeAlpha: 0.62,
      strokeWidth: 1.7,
    },
    glow: {
      alpha: 0.28,
      ringAlpha: 0.22,
      ringWidth: 2.4,
      radiusPadding: 32,
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
