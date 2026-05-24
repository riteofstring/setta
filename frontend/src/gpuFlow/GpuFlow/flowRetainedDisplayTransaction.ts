import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import type { GpuFrameReason } from "../gpuRenderer";
import type {
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";
import {
  createRetainedDisplayFrameCandidate,
  createRetainedDisplayFrameInput,
  type RetainedDisplayFrame,
  type RetainedDisplayFrameOutcome,
} from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";

import {
  hasGpuFlowRetainedPreparedFramePrePublishRepairDebt,
  resolveGpuFlowRetainedPageMaintenanceBeforePublish,
} from "./flowRetainedPageMaintenance";

const MAX_RETAINED_DISPLAY_PRE_PUBLISH_REPAIR_PASSES = 2;

type RetainedDisplayOutcome = ReturnType<
  typeof createRetainedDisplayFrameCandidate
>;
type RetainedPrePublishMaintenance = ReturnType<
  typeof resolveGpuFlowRetainedPageMaintenanceBeforePublish
>;

type RetainedDisplayTransactionTiming = {
  readonly elapsedMs: number;
  readonly outcome: RetainedDisplayOutcome;
};

type RetainedPageMaintenanceTiming = {
  readonly elapsedMs: number;
  readonly maintenance: RetainedPrePublishMaintenance;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
};

export type GpuFlowRetainedDisplayPublicationResult = {
  readonly retainedDisplayOutcome: RetainedDisplayOutcome;
  readonly retainedDisplayTransactionMs: number;
  readonly retainedPageMaintenanceMs: number;
  readonly retainedPagePreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly prePublishRetainedPageMaintenance: RetainedPrePublishMaintenance;
};

export type GpuFlowRetainedDisplayPublicationInput = {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly nowMs: number;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
};

export function resolveGpuFlowRetainedDisplayPublication({
  darkMode,
  deferResolutionUpdates,
  nowMs,
  preparedFrame,
  previousRetainedDisplayFrame,
  retainedContentPageManager,
  retainedRuntimeFrame,
}: GpuFlowRetainedDisplayPublicationInput): GpuFlowRetainedDisplayPublicationResult {
  const initialMaintenance = resolveInitialPrePublishRetainedPageMaintenance({
    darkMode,
    deferResolutionUpdates,
    preparedFrame,
    previousRetainedDisplayFrame,
    retainedContentPageManager,
  });
  const candidateTransaction = createRetainedDisplayCandidateWithTiming({
    nowMs,
    previousRetainedDisplayFrame,
    retainedPagePreparedFrame: initialMaintenance.preparedFrame,
    retainedRuntimeFrame,
  });
  return {
    retainedDisplayOutcome: candidateTransaction.outcome,
    retainedDisplayTransactionMs: candidateTransaction.elapsedMs,
    retainedPageMaintenanceMs: initialMaintenance.elapsedMs,
    retainedPagePreparedFrame: initialMaintenance.preparedFrame,
    prePublishRetainedPageMaintenance: initialMaintenance.maintenance,
  };
}

export function selectGpuFlowRetainedDisplayFollowUpFrameReason({
  deferResolutionUpdates,
  outcomeKind,
  trueHoleRectCount = 0,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly outcomeKind: RetainedDisplayFrameOutcome["kind"];
  readonly trueHoleRectCount?: number | undefined;
}): GpuFrameReason | null {
  if (trueHoleRectCount > 0) {
    return "texture-upload";
  }
  if (
    shouldRequestGpuFlowRetainedDisplayFollowUpFrame({
      deferResolutionUpdates,
      outcomeKind,
    })
  ) {
    return "texture-upload";
  }
  return null;
}

function shouldRequestGpuFlowRetainedDisplayFollowUpFrame({
  deferResolutionUpdates,
  outcomeKind,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly outcomeKind: RetainedDisplayFrameOutcome["kind"];
}): boolean {
  return outcomeKind === "hold-previous" && !deferResolutionUpdates;
}

function resolveInitialPrePublishRetainedPageMaintenance({
  darkMode,
  deferResolutionUpdates,
  preparedFrame,
  previousRetainedDisplayFrame,
  retainedContentPageManager,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
}): RetainedPageMaintenanceTiming {
  const hasPrePublishRepairDebt =
    hasGpuFlowRetainedPreparedFramePrePublishRepairDebt(preparedFrame);
  if (!hasPrePublishRepairDebt || deferResolutionUpdates) {
    return {
      elapsedMs: 0,
      maintenance: null,
      preparedFrame,
    };
  }
  return resolveRetainedPageMaintenanceBeforePublishWithTiming({
    darkMode,
    deferResolutionUpdates,
    maxPasses: MAX_RETAINED_DISPLAY_PRE_PUBLISH_REPAIR_PASSES,
    preparedFrame,
    previousRetainedDisplayFrame,
    previousProtectedPageKeys:
      previousRetainedDisplayFrame?.pageFrame.protectedPageKeys ?? [],
    retainedContentPageManager,
  });
}

function resolveRetainedPageMaintenanceBeforePublishWithTiming({
  darkMode,
  deferResolutionUpdates,
  maxPasses,
  preparedFrame,
  previousRetainedDisplayFrame,
  previousProtectedPageKeys,
  retainedContentPageManager,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly maxPasses?: number | undefined;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly previousProtectedPageKeys: readonly string[];
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
}): RetainedPageMaintenanceTiming {
  const finishMeasure = startGpuFlowPerformanceMeasure(
    "retained-prepublish-maintenance",
    {
      frame: preparedFrame.frame,
      previousDisplayFrameId: previousRetainedDisplayFrame?.id ?? null,
    },
  );
  const maintenance = resolveGpuFlowRetainedPageMaintenanceBeforePublish({
    darkMode,
    deferResolutionUpdates,
    maxPasses,
    preparedFrame,
    previousProtectedPageKeys,
    retainedContentPageManager,
  });
  const elapsedMs = finishMeasure();
  return {
    elapsedMs,
    maintenance,
    preparedFrame: maintenance?.result.repairedPreparedFrame ?? preparedFrame,
  };
}

function createRetainedDisplayCandidateWithTiming({
  nowMs,
  previousRetainedDisplayFrame,
  retainedPagePreparedFrame,
  retainedRuntimeFrame,
}: {
  readonly nowMs: number;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedPagePreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): RetainedDisplayTransactionTiming {
  const finishMeasure = startGpuFlowPerformanceMeasure(
    "retained-display-transaction",
    {
      authority: "visible-frame-candidate",
      frame: retainedPagePreparedFrame.frame,
      previousDisplayFrameId: previousRetainedDisplayFrame?.id ?? null,
    },
  );
  const outcome = createRetainedDisplayFrameCandidate({
    nowMs,
    prepared: createRetainedDisplayFrameInput({
      pageFrame: retainedPagePreparedFrame,
      retainedRuntimeFrame,
    }),
    previous: previousRetainedDisplayFrame,
  });
  const elapsedMs = finishMeasure();
  return {
    elapsedMs,
    outcome,
  };
}
