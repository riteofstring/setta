import type { ProfilerOnRenderCallback } from "react";

export function workflowGraphReactCommitRecorder(surfaceId: string): ProfilerOnRenderCallback {
  return (...render) => {
    const [id, phase, actualDuration, baseDuration, startTime, commitTime] = render;
    window.__settaWorkflowGraphPhase0ReactCommit?.({
      actualDuration,
      baseDuration,
      commitTime,
      id,
      phase,
      startTime,
      surfaceId,
    });
  };
}
