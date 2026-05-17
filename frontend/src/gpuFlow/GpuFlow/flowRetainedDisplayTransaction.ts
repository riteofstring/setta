import type {
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import {
  createRetainedDisplayFrameInput,
  resolveRetainedDisplayFrameTransaction,
  type RetainedDisplayFrame,
} from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";

import { resolveGpuFlowRetainedPageMaintenanceBeforePublish } from "./flowRetainedPageMaintenance";

type RetainedDisplayOutcome = ReturnType<
  typeof resolveRetainedDisplayFrameTransaction
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

type RetainedDisplayPublicationResult = {
  readonly retainedDisplayOutcome: RetainedDisplayOutcome;
  readonly retainedDisplayTransactionMs: number;
  readonly retainedPageMaintenanceMs: number;
  readonly retainedPagePreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly prePublishRetainedPageMaintenance: RetainedPrePublishMaintenance;
};

export function resolveGpuFlowRetainedDisplayPublication({
  darkMode,
  deferResolutionUpdates,
  nowMs,
  preparedFrame,
  previousRetainedDisplayFrame,
  retainedContentPageManager,
  retainedRuntimeFrame,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly nowMs: number;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): RetainedDisplayPublicationResult {
  const initialMaintenance = resolveInitialPrePublishRetainedPageMaintenance({
    darkMode,
    deferResolutionUpdates,
    preparedFrame,
    previousRetainedDisplayFrame,
    retainedContentPageManager,
  });
  const initialTransaction = resolveRetainedDisplayTransactionWithTiming({
    allowColdPlaceholder: previousRetainedDisplayFrame === null,
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
  if (!previousRetainedDisplayFrame || preparedFrame.trueHoleRectCount === 0) {
    return {
      elapsedMs: 0,
      maintenance: null,
      preparedFrame,
    };
  }
  return resolveRetainedPageMaintenanceBeforePublishWithTiming({
    darkMode,
    deferResolutionUpdates,
    preparedFrame,
    previousRetainedDisplayFrame,
    retainedContentPageManager,
  });
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
  const repairMaintenance =
    resolveRetainedPageMaintenanceBeforePublishWithTiming({
      darkMode,
      deferResolutionUpdates,
      preparedFrame: retainedPagePreparedFrame,
      previousRetainedDisplayFrame,
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
}): RetainedDisplayPublicationResult {
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
  preparedFrame,
  previousRetainedDisplayFrame,
  retainedContentPageManager,
}: {
  readonly darkMode: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
}): RetainedPageMaintenanceTiming {
  const finishMeasure = startGpuFlowPerformanceMeasure(
    "retained-prepublish-maintenance",
    {
      frame: preparedFrame.frame,
      previousDisplayFrameId: previousRetainedDisplayFrame.id,
    },
  );
  const maintenance = resolveGpuFlowRetainedPageMaintenanceBeforePublish({
    darkMode,
    deferResolutionUpdates,
    preparedFrame,
    previousProtectedPageKeys:
      previousRetainedDisplayFrame.pageFrame.protectedPageKeys,
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
