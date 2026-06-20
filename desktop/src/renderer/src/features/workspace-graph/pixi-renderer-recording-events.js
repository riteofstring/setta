import {
  ensureWorkflowGraphRecordingManualSnapshotListener,
  recordWorkflowGraphInteractionEvent,
  recordWorkflowGraphReplacementEvent,
  recordWorkflowGraphSnapshotEvent,
} from "./workflow-graph-recording";

export function createWorkflowGraphRendererRecorder({ getSnapshot, surfaceId }) {
  ensureWorkflowGraphRecordingManualSnapshotListener();
  const snapshot = () => getSnapshot?.() ?? null;
  const recordInteraction = (interaction) =>
    recordWorkflowGraphInteractionEvent({
      ...interaction,
      snapshot: snapshot(),
      surfaceId,
    });

  return {
    edgePointerCancel: (edgeDrawing) => {
      recordInteraction(edgeDrawInteraction(edgeDrawing, "cancel", "pointercancel"));
      recordSnapshot("pointercancel");
    },
    edgePointerUp: (edgeDrawing, targetPort) => {
      recordInteraction(edgePointerUpInteraction(edgeDrawing, targetPort));
      recordSnapshot("pointerup");
    },
    edgeStart: (sourceNodeId, sourcePortId) => {
      recordInteraction({
        affectedNodeIds: [sourceNodeId],
        kind: "edge_draw",
        phase: "start",
        reason: "pointerdown",
        sourceNodeId,
        sourcePortId,
      });
    },
    interaction: recordInteraction,
    marqueePointerCancel: () => {
      recordInteraction({ kind: "marquee", phase: "cancel", reason: "pointercancel" });
      recordSnapshot("pointercancel");
    },
    marqueePointerUp: (selectedNodeIds) => {
      const touchedNodeIds = [...selectedNodeIds];
      recordInteraction({
        affectedNodeIds: touchedNodeIds,
        kind: "marquee",
        phase: "commit",
        reason: "pointerup",
      });
      recordSnapshot("pointerup", { touchedNodeIds });
    },
    marqueeStart: () => {
      recordInteraction({ kind: "marquee", phase: "start", reason: "pointerdown" });
    },
    nodePointerCancel: () => recordSnapshot("pointercancel"),
    nodePointerUp: () => recordSnapshot("pointerup"),
    pointerPanCancel: () => {
      recordInteraction({ kind: "pointer_pan", phase: "cancel", reason: "pointercancel" });
      recordSnapshot("pointercancel");
    },
    pointerPanCommit: () => {
      recordInteraction({ kind: "pointer_pan", phase: "commit", reason: "pointerup" });
      recordSnapshot("pointerup");
    },
    pointerPanStart: () => {
      recordInteraction({ kind: "pointer_pan", phase: "start", reason: "pointerdown" });
    },
    replacement: (replacement) =>
      recordWorkflowGraphReplacementEvent({
        ...replacement,
        snapshot: snapshot(),
        surfaceId,
      }),
    snapshot: recordSnapshot,
    wheelBurstSettled: ({ eventCount, treatment }) => {
      recordInteraction({
        kind: "wheel",
        phase: "commit",
        reason: `${treatment}:${eventCount}`,
      });
      recordSnapshot("wheel_burst_end");
    },
  };

  function recordSnapshot(trigger, options = {}) {
    recordWorkflowGraphSnapshotEvent({
      ...options,
      snapshot: snapshot(),
      surfaceId,
      trigger,
    });
  }
}

function edgePointerUpInteraction(edgeDrawing, targetPort) {
  if (!targetPort) {
    return edgeDrawInteraction(edgeDrawing, "cancel", "pointerup_without_target");
  }
  return {
    ...edgeDrawInteraction(edgeDrawing, "commit", "pointerup"),
    affectedNodeIds: [edgeDrawing.sourceNodeId, targetPort.nodeId],
    targetNodeId: targetPort.nodeId,
    targetPortId: targetPort.portId,
  };
}

function edgeDrawInteraction(edgeDrawing, phase, reason) {
  return {
    affectedNodeIds: [edgeDrawing.sourceNodeId],
    kind: "edge_draw",
    phase,
    reason,
    sourceNodeId: edgeDrawing.sourceNodeId,
    sourcePortId: edgeDrawing.sourcePortId,
  };
}
