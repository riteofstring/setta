import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import type { GpuFrameReason } from "../gpuRenderer";
import type {
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";
import {
  createRetainedDisplayFrameInput,
  resolveRetainedDisplayFrameTransaction,
  type RetainedDisplayFrame,
  type RetainedDisplayFrameOutcome,
} from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";

import {
  hasGpuFlowRetainedPreparedFramePrePublishRepairDebt,
  resolveGpuFlowRetainedPageMaintenanceBeforePublish,
} from "./flowRetainedPageMaintenance";

const MAX_RETAINED_DISPLAY_PRE_PUBLISH_REPAIR_PASSES = 2;
const MAX_DEFERRED_RETAINED_DISPLAY_HOLD_MS = 50;

type RetainedDisplayOutcome = ReturnType<
  typeof resolveRetainedDisplayFrameTransaction
>;
type RetainedDisplayPublishedOutcome = Extract<
  RetainedDisplayOutcome,
  { readonly frame: RetainedDisplayFrame }
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

type RetainedHeldRepairPublication = {
  readonly prePublishRetainedPageMaintenance: RetainedPrePublishMaintenance;
  readonly retainedDisplayOutcome: RetainedDisplayOutcome;
  readonly retainedDisplayTransactionMs: number;
  readonly retainedPageMaintenanceMs: number;
  readonly retainedPagePreparedFrame: RetainedContentTexturePagePreparedFrame;
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

export type GpuFlowRetainedDisplayPublicationOutcomeFrame =
  | {
      readonly kind: "blocked";
      readonly reason: string;
    }
  | {
      readonly frame: RetainedDisplayFrame;
      readonly kind: "published";
      readonly outcome: RetainedDisplayPublishedOutcome;
      readonly outcomeKind: RetainedDisplayPublishedOutcome["kind"];
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
    nowMs,
    preparedFrame,
    previousRetainedDisplayFrame,
    retainedContentPageManager,
  });
  const initialTransaction = resolveRetainedDisplayTransactionWithTiming({
    allowColdPlaceholder: false,
    nowMs,
    previousRetainedDisplayFrame,
    retainedPagePreparedFrame: initialMaintenance.preparedFrame,
    retainedRuntimeFrame,
  });
  const heldRepair = resolveHeldPreviousRetainedDisplayRepairPublication({
    darkMode,
    deferResolutionUpdates,
    nowMs,
    previousRetainedDisplayFrame,
    prePublishRetainedPageMaintenance: initialMaintenance.maintenance,
    retainedContentPageManager,
    retainedDisplayOutcome: initialTransaction.outcome,
    retainedPagePreparedFrame: initialMaintenance.preparedFrame,
    retainedRuntimeFrame,
  });
  return createRetainedDisplayPublicationResult({
    heldRepair,
    initialMaintenance,
    initialTransaction,
  });
}

export function resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
  outcome: RetainedDisplayOutcome,
): GpuFlowRetainedDisplayPublicationOutcomeFrame {
  if (outcome.kind === "block-cold-first-coverage") {
    return {
      kind: "blocked",
      reason: outcome.reason,
    };
  }
  return {
    frame: outcome.frame,
    kind: "published",
    outcome,
    outcomeKind: outcome.kind,
  };
}

export function notifyGpuFlowRetainedDisplayFollowUpFrameNeeded({
  deferResolutionUpdates,
  onRetainedDisplayFollowUpFrameNeeded,
  outcomeKind,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly onRetainedDisplayFollowUpFrameNeeded:
    | ((reason: GpuFrameReason) => void)
    | undefined;
  readonly outcomeKind: RetainedDisplayFrameOutcome["kind"];
}): void {
  if (
    shouldRequestGpuFlowRetainedDisplayFollowUpFrame({
      deferResolutionUpdates,
      outcomeKind,
    })
  ) {
    onRetainedDisplayFollowUpFrameNeeded?.("texture-upload");
  }
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
  nowMs,
  preparedFrame,
  previousRetainedDisplayFrame,
  retainedContentPageManager,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly nowMs: number;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
}): RetainedPageMaintenanceTiming {
  const canHoldPreviousDuringDeferredResolution =
    deferResolutionUpdates &&
    canDeferRetainedDisplayRepairWithPreviousFrame({
      nowMs,
      previousRetainedDisplayFrame,
    });
  const hasPrePublishRepairDebt =
    hasGpuFlowRetainedPreparedFramePrePublishRepairDebt(preparedFrame);
  if (!hasPrePublishRepairDebt || canHoldPreviousDuringDeferredResolution) {
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

function canDeferRetainedDisplayRepairWithPreviousFrame({
  nowMs,
  previousRetainedDisplayFrame,
}: {
  readonly nowMs: number;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
}): boolean {
  if (!previousRetainedDisplayFrame) {
    return false;
  }
  if (
    previousRetainedDisplayFrame.diagnostics.transactionOutcome ===
    "hold-previous"
  ) {
    return false;
  }
  return (
    nowMs - previousRetainedDisplayFrame.diagnostics.publishedAtMs <=
    MAX_DEFERRED_RETAINED_DISPLAY_HOLD_MS
  );
}

function resolveHeldPreviousRetainedDisplayRepairPublication({
  darkMode,
  deferResolutionUpdates,
  nowMs,
  previousRetainedDisplayFrame,
  prePublishRetainedPageMaintenance,
  retainedContentPageManager,
  retainedDisplayOutcome,
  retainedPagePreparedFrame,
  retainedRuntimeFrame,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly nowMs: number;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly prePublishRetainedPageMaintenance: RetainedPrePublishMaintenance;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly retainedDisplayOutcome: RetainedDisplayOutcome;
  readonly retainedPagePreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): RetainedHeldRepairPublication | null {
  if (
    !shouldRepairHeldPreviousRetainedDisplayFrame({
      prePublishRetainedPageMaintenance,
      previousRetainedDisplayFrame,
      retainedDisplayOutcome,
    })
  ) {
    return null;
  }
  if (previousRetainedDisplayFrame === null) {
    return null;
  }
  if (deferResolutionUpdates) {
    return null;
  }
  const repairMaintenance =
    resolveRetainedPageMaintenanceBeforePublishWithTiming({
      darkMode,
      deferResolutionUpdates,
      maxPasses: MAX_RETAINED_DISPLAY_PRE_PUBLISH_REPAIR_PASSES,
      preparedFrame: retainedPagePreparedFrame,
      previousRetainedDisplayFrame,
      previousProtectedPageKeys:
        previousRetainedDisplayFrame.pageFrame.protectedPageKeys,
      retainedContentPageManager,
    });
  if (!didRetainedPageMaintenanceAdvance(repairMaintenance.maintenance)) {
    return {
      prePublishRetainedPageMaintenance: repairMaintenance.maintenance,
      retainedDisplayOutcome,
      retainedDisplayTransactionMs: 0,
      retainedPageMaintenanceMs: repairMaintenance.elapsedMs,
      retainedPagePreparedFrame,
    };
  }
  const repairedTransaction = resolveRetainedDisplayTransactionWithTiming({
    allowColdPlaceholder: false,
    nowMs,
    previousRetainedDisplayFrame,
    retainedPagePreparedFrame: repairMaintenance.preparedFrame,
    retainedRuntimeFrame,
  });
  return {
    prePublishRetainedPageMaintenance: repairMaintenance.maintenance,
    retainedDisplayOutcome: repairedTransaction.outcome,
    retainedDisplayTransactionMs: repairedTransaction.elapsedMs,
    retainedPageMaintenanceMs: repairMaintenance.elapsedMs,
    retainedPagePreparedFrame: repairMaintenance.preparedFrame,
  };
}

function createRetainedDisplayPublicationResult({
  heldRepair,
  initialMaintenance,
  initialTransaction,
}: {
  readonly heldRepair: RetainedHeldRepairPublication | null;
  readonly initialMaintenance: RetainedPageMaintenanceTiming;
  readonly initialTransaction: RetainedDisplayTransactionTiming;
}): GpuFlowRetainedDisplayPublicationResult {
  if (!heldRepair) {
    return {
      retainedDisplayOutcome: initialTransaction.outcome,
      retainedDisplayTransactionMs: initialTransaction.elapsedMs,
      retainedPageMaintenanceMs: initialMaintenance.elapsedMs,
      retainedPagePreparedFrame: initialMaintenance.preparedFrame,
      prePublishRetainedPageMaintenance: initialMaintenance.maintenance,
    };
  }
  return {
    retainedDisplayOutcome: heldRepair.retainedDisplayOutcome,
    retainedDisplayTransactionMs:
      initialTransaction.elapsedMs + heldRepair.retainedDisplayTransactionMs,
    retainedPageMaintenanceMs:
      initialMaintenance.elapsedMs + heldRepair.retainedPageMaintenanceMs,
    retainedPagePreparedFrame: heldRepair.retainedPagePreparedFrame,
    prePublishRetainedPageMaintenance:
      heldRepair.prePublishRetainedPageMaintenance,
  };
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

function resolveRetainedDisplayTransactionWithTiming({
  allowColdPlaceholder,
  nowMs,
  previousRetainedDisplayFrame,
  retainedPagePreparedFrame,
  retainedRuntimeFrame,
}: {
  readonly allowColdPlaceholder: boolean;
  readonly nowMs: number;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedPagePreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): RetainedDisplayTransactionTiming {
  const finishMeasure = startGpuFlowPerformanceMeasure(
    "retained-display-transaction",
    {
      allowColdPlaceholder,
      frame: retainedPagePreparedFrame.frame,
      previousDisplayFrameId: previousRetainedDisplayFrame?.id ?? null,
    },
  );
  const outcome = resolveRetainedDisplayFrameTransaction({
    allowColdPlaceholder,
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

function shouldRepairHeldPreviousRetainedDisplayFrame({
  prePublishRetainedPageMaintenance,
  previousRetainedDisplayFrame,
  retainedDisplayOutcome,
}: {
  readonly prePublishRetainedPageMaintenance: RetainedPrePublishMaintenance;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayOutcome: RetainedDisplayOutcome;
}): boolean {
  return (
    retainedDisplayOutcome.kind === "hold-previous" &&
    previousRetainedDisplayFrame !== null &&
    !prePublishRetainedPageMaintenance
  );
}

function didRetainedPageMaintenanceAdvance(
  maintenance: RetainedPrePublishMaintenance,
): boolean {
  return Boolean(
    maintenance &&
      (maintenance.result.executedItemCount > 0 ||
        maintenance.result.uploadCount > 0),
  );
}
