export const workflowVisualStatePriority = [
  "failed",
  "cancelled",
  "waiting_approval",
  "running",
  "completed",
  "pending",
  "idle",
];

const visualStatePriorityRanks = Object.fromEntries(
  workflowVisualStatePriority.map((state, index) => [state, index + 1]),
);

const nodeStateStyles = {
  cancelled: {
    accentAlpha: 0.86,
    accentColor: 0x94a3b8,
    bodyFillAlpha: 0.88,
    strokeAlpha: 0.88,
    strokeColor: 0x94a3b8,
    strokeWidth: 3,
  },
  completed: {
    accentAlpha: 0.68,
    accentColor: 0x22c55e,
    bodyFillAlpha: 0.9,
    strokeAlpha: 0.72,
    strokeColor: 0x86efac,
    strokeWidth: 2,
  },
  failed: {
    accentAlpha: 0.96,
    accentColor: 0xef4444,
    bodyFillAlpha: 0.9,
    strokeAlpha: 0.95,
    strokeColor: 0xfb7185,
    strokeWidth: 3.25,
  },
  idle: {
    accentAlpha: 0,
    accentColor: 0xffffff,
    bodyFillAlpha: 0.88,
    strokeAlpha: 0.42,
    strokeColor: 0xe2e8f0,
    strokeWidth: 1.5,
  },
  pending: {
    accentAlpha: 0.7,
    accentColor: 0xfacc15,
    bodyFillAlpha: 0.9,
    strokeAlpha: 0.68,
    strokeColor: 0xfde68a,
    strokeWidth: 2,
  },
  running: {
    accentAlpha: 0.94,
    accentColor: 0x67e8f9,
    bodyFillAlpha: 0.93,
    strokeAlpha: 0.94,
    strokeColor: 0x67e8f9,
    strokeWidth: 3,
  },
  waiting_approval: {
    accentAlpha: 0.96,
    accentColor: 0xf59e0b,
    bodyFillAlpha: 0.93,
    strokeAlpha: 0.96,
    strokeColor: 0xfbbf24,
    strokeWidth: 3.15,
  },
};

const edgeStateStyles = {
  cancelled: {
    strokeAlpha: 0.72,
    strokeColor: 0x94a3b8,
    strokeWidth: 2.8,
  },
  completed: {
    strokeAlpha: 0.78,
    strokeColor: 0x4ade80,
    strokeWidth: 2.8,
  },
  failed: {
    strokeAlpha: 0.9,
    strokeColor: 0xfb7185,
    strokeWidth: 3,
  },
  idle: {
    strokeAlpha: 0.36,
    strokeColor: 0x94a3b8,
    strokeWidth: 2.2,
  },
  pending: {
    strokeAlpha: 0.58,
    strokeColor: 0xfacc15,
    strokeWidth: 2.5,
  },
  running: {
    strokeAlpha: 0.94,
    strokeColor: 0x67e8f9,
    strokeWidth: 3.2,
  },
  waiting_approval: {
    strokeAlpha: 0.92,
    strokeColor: 0xf59e0b,
    strokeWidth: 3,
  },
};

const activityMarkerKindColors = {
  approval: 0xf59e0b,
  command: 0x38bdf8,
  file_change: 0x22c55e,
  workflow_status: 0xa78bfa,
};

const activityMarkerStateStyles = {
  cancelled: {
    fillAlpha: 0.62,
    strokeAlpha: 0.76,
    strokeColor: 0x94a3b8,
    strokeWidth: 2,
  },
  completed: {
    fillAlpha: 0.64,
    strokeAlpha: 0.66,
    strokeColor: 0x86efac,
    strokeWidth: 1.55,
  },
  failed: {
    fillAlpha: 0.9,
    strokeAlpha: 0.94,
    strokeColor: 0xef4444,
    strokeWidth: 2.35,
  },
  idle: {
    fillAlpha: 0.54,
    strokeAlpha: 0.48,
    strokeColor: 0x94a3b8,
    strokeWidth: 1.35,
  },
  pending: {
    fillAlpha: 0.82,
    strokeAlpha: 0.82,
    strokeColor: 0xfacc15,
    strokeWidth: 1.9,
  },
  running: {
    fillAlpha: 0.96,
    strokeAlpha: 0.95,
    strokeColor: 0x67e8f9,
    strokeWidth: 2.25,
  },
  waiting_approval: {
    fillAlpha: 0.98,
    strokeAlpha: 0.96,
    strokeColor: 0xf59e0b,
    strokeWidth: 2.45,
  },
};

const workflowNodeVisualStatesByStatus = {
  cancelled: "cancelled",
  failed: "failed",
  not_started: "idle",
  pending: "pending",
  ready: "pending",
  recovery_required: "failed",
  running: "running",
  succeeded: "completed",
  waiting_approval: "waiting_approval",
};

const workflowEdgeVisualStatesByStatus = {
  active: "running",
  cancelled: "cancelled",
  completed: "completed",
  inactive: "idle",
};

const workspaceActivityVisualStatesByStatus = {
  answered: "completed",
  approved: "completed",
  cancelled: "cancelled",
  completed: "completed",
  denied: "failed",
  failed: "failed",
  pending: "pending",
  running: "running",
  unknown: "idle",
  waiting_approval: "waiting_approval",
};

export function visualStatePriorityRank(state) {
  const rank = visualStatePriorityRanks[state];
  if (rank === undefined) {
    throw new Error(`unknown workflow visual state: ${String(state)}`);
  }
  return rank;
}

export function highestPriorityVisualState(states) {
  if (states.length === 0) {
    return "idle";
  }
  return states.reduce((highest, candidate) =>
    visualStatePriorityRank(candidate) < visualStatePriorityRank(highest) ? candidate : highest,
  );
}

export function workflowNodeRuntimeVisualState(status) {
  return visualStateForStatus(
    workflowNodeVisualStatesByStatus,
    status ?? "not_started",
    "workflow node",
  );
}

export function workflowEdgeRuntimeVisualState(status) {
  return visualStateForStatus(
    workflowEdgeVisualStatesByStatus,
    status ?? "inactive",
    "workflow edge",
  );
}

export function workspaceActivityRuntimeVisualState(status) {
  return visualStateForStatus(workspaceActivityVisualStatesByStatus, status, "workspace activity");
}

export function resolveWorkflowNodeVisualState(node) {
  const state = workflowNodeRuntimeVisualState(node.status);
  const style = nodeStateStyles[state];
  return {
    channels: {
      bodyFill: node.color,
      bodyFillAlpha: style.bodyFillAlpha,
      bodyStroke: style.strokeColor,
      bodyStrokeAlpha: style.strokeAlpha,
      bodyStrokeWidth: style.strokeWidth,
      statusAccent: style.accentColor,
      statusAccentAlpha: style.accentAlpha,
      statusAccentHeight: 4,
      statusAccentWidth: 32,
    },
    priority: visualStatePriorityRank(state),
    sourceStatus: node.status ?? "not_started",
    state,
  };
}

export function resolveWorkflowEdgeVisualState(edge) {
  const state = workflowEdgeRuntimeVisualState(edge.status);
  const style = edgeStateStyles[state];
  const usesRuntimeStatus = typeof edge.status === "string";
  return {
    channels: {
      stroke: usesRuntimeStatus ? style.strokeColor : (edge.color ?? style.strokeColor),
      strokeAlpha: usesRuntimeStatus ? style.strokeAlpha : (edge.alpha ?? style.strokeAlpha),
      strokeWidth: usesRuntimeStatus ? style.strokeWidth : (edge.width ?? style.strokeWidth),
    },
    priority: visualStatePriorityRank(state),
    sourceStatus: edge.status ?? "inactive",
    state,
  };
}

export function resolveWorkspaceActivityMarkerVisualState(marker) {
  const state = workspaceActivityRuntimeVisualState(marker.status);
  const style = activityMarkerStateStyles[state];
  return {
    channels: {
      fill: activityMarkerKindColors[marker.kind] ?? activityMarkerKindColors.workflow_status,
      fillAlpha: style.fillAlpha,
      kindShape: marker.kind,
      stroke: style.strokeColor,
      strokeAlpha: style.strokeAlpha,
      strokeWidth: style.strokeWidth,
    },
    priority: visualStatePriorityRank(state),
    sourceStatus: marker.status,
    state,
  };
}

export function workflowNodeVisualFingerprint(node) {
  const visual = resolveWorkflowNodeVisualState(node);
  return JSON.stringify({
    channels: visual.channels,
    height: node.height,
    state: visual.state,
    width: node.width,
  });
}

export function workflowEdgeVisualFingerprint(edge) {
  const visual = resolveWorkflowEdgeVisualState(edge);
  return JSON.stringify({
    channels: visual.channels,
    diagnostic: edge.diagnostic ?? null,
    state: visual.state,
  });
}

export function workspaceActivityMarkerVisualFingerprint(marker) {
  const visual = resolveWorkspaceActivityMarkerVisualState(marker);
  return JSON.stringify({
    anchorKind: marker.anchorKind,
    channels: visual.channels,
    kind: marker.kind,
    laneIndex: marker.laneIndex,
    nodeId: marker.nodeId,
    slotIndex: marker.slotIndex,
    state: visual.state,
  });
}

function visualStateForStatus(statesByStatus, status, label) {
  const state = statesByStatus[status];
  if (state === undefined) {
    throw new Error(`unsupported ${label} status: ${String(status)}`);
  }
  return state;
}
