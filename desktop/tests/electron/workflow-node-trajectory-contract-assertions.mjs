export function assertWorkflowNodeDetailsEvidence(state, nodeExecutionId) {
  if (
    state.layout !== "agent" ||
    !state.detailsDockPresent ||
    state.nestedTrajectoryFramePresent ||
    !state.trajectory?.trajectoryPresent ||
    state.chatTranscriptScrollerCount !== 1
  ) {
    throw new Error(`workflow node details evidence missing: ${JSON.stringify(state)}`);
  }
  if (nodeExecutionId === "") {
    throw new Error("workflow node execution id is required for details evidence");
  }
}

export function assertTrajectorySnapshotCursors(trajectory, execution) {
  if (
    trajectory.lastChatEventStreamId === "" ||
    trajectory.lastChatEventSequence <= 0 ||
    trajectory.lastWorkflowEventOrdinal !== execution.lastEventOrdinal
  ) {
    throw new Error(
      `trajectory snapshot cursors mismatch: ${JSON.stringify({
        executionLastEventOrdinal: execution.lastEventOrdinal,
        lastChatEventSequence: trajectory.lastChatEventSequence,
        lastChatEventStreamId: trajectory.lastChatEventStreamId,
        lastWorkflowEventOrdinal: trajectory.lastWorkflowEventOrdinal,
      })}`,
    );
  }
}
