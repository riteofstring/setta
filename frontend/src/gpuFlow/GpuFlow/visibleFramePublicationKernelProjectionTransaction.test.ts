import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  GpuFlowHeldPreviousProjection,
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionTransaction,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  createGpuFlowVisiblePublicationScheduler,
} from "../projectionRuntime";
import {
  runGpuFlowVisibleFramePublicationCandidateSetKernel,
  type GpuFlowProjectionFrameRenderablePlan,
  type GpuFlowRetainedProjectionFrame,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFramePublicationKernel";

type TestProjectionPublicationFrame = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly visibleProjectionState: null;
};

const PROJECTION_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationProjectionPlan.ts", import.meta.url),
);
const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationKernel.ts", import.meta.url),
);

describe("GPU Flow visible publication kernel projection transactions", () => {
  it("selects requested, held, and blocked transactions from publication decisions", () => {
    const requestedFrame = projectionFrame({
      needsRetainedPageMaintenance: true,
    });
    const heldFrame = projectionFrame({
      needsRetainedPageMaintenance: false,
    });
    const requestedTransaction = projectionTransaction({
      id: "projection:12:1",
    });
    const heldTransaction = projectionTransaction({
      committedFrameId: 11,
      id: "projection:11:held",
      kind: "held-previous",
    });

    const requestedSelection = selectProjectionFrameTransactionThroughKernel({
      previousVisibleProjectionState: null,
      requestedProjectionCoverageMissing: false,
      requestedProjectionFrame: requestedFrame,
      requestedTransaction,
      resolveHeldRetainedProjectionFrame: () => {
        throw new Error("project-requested must not resolve held frame");
      },
    });
    expect(requestedSelection.blockedPublicationCandidate).toBeNull();
    expect(requestedSelection.renderPlan).toEqual({
      heldPreviousProjection: null,
      kind: "render",
      retainedProjectionFrame: requestedFrame,
      transaction: requestedTransaction,
    });

    const heldSelection = selectProjectionFrameTransactionThroughKernel({
      previousVisibleProjectionState: visibleProjectionState({
        transaction: heldTransaction,
      }),
      requestedProjectionCoverageMissing: true,
      requestedProjectionFrame: requestedFrame,
      requestedTransaction,
      resolveHeldRetainedProjectionFrame: () => heldFrame,
    });
    expect(heldSelection.blockedPublicationCandidate).toBeNull();
    expect(heldSelection.resolvedHeldTransaction).toBe(
      heldSelection.renderPlan?.transaction,
    );
    expect(heldSelection.renderPlan).toEqual({
      heldPreviousProjection: expect.objectContaining({
        committedFrameId: 11,
        consecutiveFrameCount: 1,
        projectionSampleId: requestedTransaction.sample.id,
        reason: "retained-projection-coverage-missing",
        requestedProjectionSampleId: requestedTransaction.sample.id,
      }),
      kind: "render",
      retainedProjectionFrame: {
        ...heldFrame,
        needsRetainedPageMaintenance: true,
      },
      transaction: expect.objectContaining({
        committedFrameId: 11,
        kind: "held-previous",
        sample: requestedTransaction.sample,
      }),
    });

    const blockedSelection = selectProjectionFrameTransactionThroughKernel({
      previousVisibleProjectionState: visibleProjectionState({
        heldPreviousProjection: {
          ...heldProjection(),
          consecutiveFrameCount: 6,
        },
        transaction: heldTransaction,
      }),
      requestedProjectionCoverageMissing: true,
      requestedProjectionFrame: requestedFrame,
      requestedTransaction,
      resolveHeldRetainedProjectionFrame: () => {
        throw new Error("blocked must not resolve held frame");
      },
    });
    expect(blockedSelection.renderPlan).toBeNull();
    expect(blockedSelection.blockedPublicationCandidate).toEqual({
      blockedReasons: [
        {
          actorId: null,
          family: "retained-projection",
          reason: "held-previous-budget-exceeded",
        },
      ],
      frozenFrameId: 11,
    });
    expect(blockedSelection.outcomeKind).toBe("blocked");
  });

  it("keeps retained projection transaction decisions in the kernel and out of render planning", () => {
    const projectionPlanSource = readFileSync(
      PROJECTION_PLAN_MODULE_PATH,
      "utf8",
    );
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");

    expect(projectionPlanSource).not.toContain(
      "GpuFlowRetainedProjectionPublicationTransactionDecision",
    );
    expect(projectionPlanSource).not.toContain(
      "selectGpuFlowProjectionFrameTransactionFromPublicationDecision",
    );
    expect(projectionPlanSource).not.toContain(
      "createGpuFlowProjectionFrameTransactionSelector",
    );
    expect(kernelSource).toContain(
      "GpuFlowRetainedProjectionPublicationTransactionDecision",
    );
    expect(kernelSource).toContain(
      "selectGpuFlowProjectionFrameTransactionFromPublicationDecision",
    );
    expect(kernelSource).not.toContain(
      "export function selectGpuFlowProjectionFrameTransactionFromPublicationDecision",
    );
    expect(kernelSource).not.toContain(
      "export function decideGpuFlowRetainedProjectionPublicationTransaction",
    );
    expect(kernelSource).toContain(
      "createGpuFlowRetainedProjectionPublicationDecisionSelector",
    );
    expect(kernelSource).not.toContain(
      "export function createGpuFlowProjectionFrameTransactionSelector",
    );
    expect(kernelSource).not.toContain(
      "export function createGpuFlowRetainedProjectionPublicationDecisionSelector",
    );
    expect(kernelSource).toContain(
      "function decideGpuFlowRetainedProjectionPublicationTransaction",
    );
    expect(kernelSource).toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
  });
});

function projectionFrame({
  needsRetainedPageMaintenance = false,
}: {
  readonly needsRetainedPageMaintenance?: boolean | undefined;
} = {}): GpuFlowRetainedProjectionFrame {
  return {
    flatSurfaces: [],
    missingCoverageSurfaceIds: new Set(),
    needsRetainedPageMaintenance,
  };
}

function selectProjectionFrameTransactionThroughKernel({
  previousVisibleProjectionState,
  requestedProjectionCoverageMissing,
  requestedProjectionFrame,
  requestedTransaction,
  resolveHeldRetainedProjectionFrame,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly requestedProjectionCoverageMissing: boolean;
  readonly requestedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
  readonly resolveHeldRetainedProjectionFrame: (input: {
    readonly transaction: GpuFlowProjectionTransaction;
  }) => GpuFlowRetainedProjectionFrame;
}): {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly outcomeKind: string;
  readonly renderPlan: GpuFlowProjectionFrameRenderablePlan | null;
  readonly resolvedHeldTransaction: GpuFlowProjectionTransaction | null;
} {
  const scheduler = createGpuFlowVisiblePublicationScheduler();
  const selection: {
    blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
    renderPlan: GpuFlowProjectionFrameRenderablePlan | null;
  } = {
    blockedPublicationCandidate: null,
    renderPlan: null,
  };
  let resolvedHeldTransaction: GpuFlowProjectionTransaction | null = null;
  const result = runGpuFlowVisibleFramePublicationCandidateSetKernel<
    TestProjectionPublicationFrame,
    TestProjectionPublicationFrame
  >({
    prepareContentPublicationFrame: () => testProjectionPublicationFrame(),
    prepareMotionProjectionFrame: () => ({
      createBlockedProjectionFrame: ({ blockedPublicationCandidate }) => {
        return testProjectionPublicationFrame({
          blockedPublicationCandidate,
        });
      },
      hasActiveRetainedDomControl: false,
      kind: "render",
      requestedProjectionCoverageMissing,
      requestedProjectionFrame,
      requestedTransaction,
      resolveHeldRetainedProjectionFrame: ({ transaction }) => {
        resolvedHeldTransaction = transaction;
        return resolveHeldRetainedProjectionFrame({ transaction });
      },
      renderProjectionFrame: ({ projectionFrameRenderPlan }) => {
        selection.renderPlan = projectionFrameRenderPlan;
        return testProjectionPublicationFrame();
      },
    }),
    publish: (transaction) => {
      selection.blockedPublicationCandidate =
        transaction.preparedFrame.motionProjectionFrame
          .blockedPublicationCandidate;
    },
    sampleVisibleFramePublication: () =>
      visibleFramePublicationSample({
        previousVisibleProjectionState,
        sample: requestedTransaction.sample,
      }),
    scheduler,
  });
  return {
    blockedPublicationCandidate: selection.blockedPublicationCandidate,
    outcomeKind: result.outcome.kind,
    renderPlan: selection.renderPlan,
    resolvedHeldTransaction,
  };
}

function testProjectionPublicationFrame({
  blockedPublicationCandidate = null,
}: {
  readonly blockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
} = {}): TestProjectionPublicationFrame {
  return {
    blockedPublicationCandidate,
    visibleProjectionState: null,
  };
}

function visibleFramePublicationSample({
  previousVisibleProjectionState,
  sample,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleFramePublicationSample {
  return {
    hasCommittedContentFrame: true,
    previousVisibleProjectionState,
    rawReasons: ["retained-scroll"],
    runtimeViewportFrame: false,
    sample,
    timestamp: sample.timestamp,
    viewportInteractionActive: false,
  };
}

function visibleProjectionState({
  heldPreviousProjection = null,
  transaction,
}: {
  readonly heldPreviousProjection?: GpuFlowHeldPreviousProjection | null;
  readonly transaction: GpuFlowProjectionTransaction;
}): GpuFlowVisibleProjectionState {
  const heldDebugState = heldPreviousProjection ?? {
    consecutiveFrameCount: 0,
    heldDurationMs: 0,
    reason: null,
    requestedProjectionSampleId: null,
  };
  return {
    committedFrame: {
      coherence: {
        hitGenerationId: "hit:11",
      },
      displayFrameId: 11,
    } as GpuFlowCommittedSurfaceFrame,
    debugState: {
      committedFrameId: 11,
      gestureOwner: "idle",
      heldPreviousDurationMs: heldDebugState.heldDurationMs,
      heldPreviousFrameCount: heldDebugState.consecutiveFrameCount,
      heldPreviousOverBudget: false,
      heldPreviousReason: heldDebugState.reason,
      heldPreviousRequestedSampleId:
        heldDebugState.requestedProjectionSampleId,
      lane: "motion",
      projectionSampleId: transaction.sample.id,
      projectionTransactionId: transaction.id,
      transactionKind: transaction.kind,
    },
    heldPreviousProjection,
    sample: transaction.sample,
    transaction,
  };
}

function heldProjection(): GpuFlowHeldPreviousProjection {
  return {
    activationMappingId: "activation:11:hit:11",
    canvasDrawStateId: "canvas:11",
    committedFrameId: 11,
    consecutiveFrameCount: 1,
    debugStateId: "projection:11:previous",
    domTransformBatchId: "dom-transform:11:sample-2",
    firstHeldAtMs: 16,
    heldAtMs: 32,
    heldDurationMs: 16,
    hitProjectionId: "hit:11",
    maxHeldPreviousFramesExceeded: false,
    maxHeldPreviousMsExceeded: false,
    previousTransactionId: "projection:11:previous",
    projectionSampleId: 2,
    reason: "retained-projection-coverage-missing",
    requestedProjectionSampleId: 2,
  };
}

function projectionTransaction({
  committedFrameId = 12,
  id,
  kind = "motion-projection",
}: {
  readonly committedFrameId?: number | undefined;
  readonly id: string;
  readonly kind?: GpuFlowProjectionTransaction["kind"] | undefined;
}): GpuFlowProjectionTransaction {
  return {
    committedFrameId,
    id,
    kind,
    lane: "motion",
    rawReasons: ["retained-scroll"],
    sample: liveProjectionSample(),
    startedAtMs: 16,
  };
}

function liveProjectionSample(): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id: 2,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp: 32,
    viewport: [0, 0, 1],
    viewportDelta: { x: 0, y: 10, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0.5, zoom: 0 },
  };
}
