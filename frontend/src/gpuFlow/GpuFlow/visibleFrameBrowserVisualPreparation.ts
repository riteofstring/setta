import type { MutableRefObject } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuSurfaceHandle } from "../GpuSurface";
import { isGpuFlowBrowserVisualPreparationResourceKey } from "./visibleFrameBrowserVisualResourceKeys";
import {
  recordGpuFlowBrowserVisualResourceWorkPreparationState,
  recordGpuFlowBrowserVisualResourceWorkRequested,
  type GpuFlowBrowserVisualResourceWorkOutcome,
} from "./visibleFrameBrowserVisualResourceWork";
import type { GpuFlowCommittedSurfaceBlockedCandidateResourceWork } from "./visibleFrameContentPlan";

export function requestGpuFlowBrowserVisualResourcePreparation({
  budgetSelectedResourceKeys = [],
  browserVisualRepairSelected = false,
  candidateFrame,
  candidateResourceWork,
  outcome,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly budgetSelectedResourceKeys?: readonly string[] | undefined;
  readonly browserVisualRepairSelected?: boolean | undefined;
  readonly candidateFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly outcome: GpuFlowBrowserVisualResourceWorkOutcome;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): void {
  const hasBudgetSelectedBrowserVisualResource =
    budgetSelectedResourceKeys.some(
      isGpuFlowBrowserVisualPreparationResourceKey,
    );
  const hasSelectedBrowserVisualRepair =
    browserVisualRepairSelected || hasBudgetSelectedBrowserVisualResource;
  if (candidateFrame === null) {
    return;
  }
  if (candidateResourceWork === null) {
    if (hasSelectedBrowserVisualRepair) {
      requestGpuFlowBrowserVisualResourceWorkFrame({
        candidateResourceWork: null,
        runtimeCanvas,
        surfaceRef,
      });
    }
    return;
  }
  recordGpuFlowBrowserVisualResourceWorkRequested({
    candidateResourceWork,
    nowMs: candidateResourceWork.timestamp,
    outcome,
    runtimeCanvas,
  });
  if (!hasSelectedBrowserVisualRepair) {
    return;
  }
  requestGpuFlowBrowserVisualResourceWorkFrame({
    candidateResourceWork,
    runtimeCanvas,
    surfaceRef,
  });
}

function requestGpuFlowBrowserVisualResourceWorkFrame({
  candidateResourceWork,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): void {
  const surface = surfaceRef.current;
  if (!surface) {
    return;
  }
  if (candidateResourceWork !== null) {
    recordGpuFlowBrowserVisualResourceWorkPreparationState({
      candidateResourceWork,
      nowMs: candidateResourceWork.timestamp,
      readinessState: "preparing",
      runtimeCanvas,
      wakeupSource: "immediate-frame-request",
    });
  }
  surface.requestFrame("texture-upload");
}
