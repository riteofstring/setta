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
import { createGpuFlowVisiblePublicationScheduler } from "../projectionRuntime";
import {
  runGpuFlowVisibleFramePublicationCandidateSetKernel,
  type GpuFlowProjectionFrameRenderablePlan,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFramePublicationKernel";
import type { GpuFlowRetainedProjectionFrame } from "./visibleFrameProjectionCoverage";

type TestProjectionPublicationFrame = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly visibleProjectionState: null;
};

const PROJECTION_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameProjectionPlan.ts", import.meta.url),
);
const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationKernel.ts", import.meta.url),
);
const KERNEL_CANDIDATE_ORACLE_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFrameActorAdapters/contentDecisionKernel.ts",
    import.meta.url,
  ),
);

describe("GPU Flow visible publication kernel projection transactions", () => {
  it("selects requested projection candidates and reports missing coverage for global hold/block decisions", () => {
    const requestedFrame = projectionFrame({
      needsRetainedPageMaintenance: true,
    });
    const missingRequestedFrame = projectionFrame({
      missingCoverageSurfaceIds: ["surface-a"],
      needsRetainedPageMaintenance: true,
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
      requestedTransaction,
      resolveRetainedProjectionFrame: ({ transaction }) => {
        if (transaction === requestedTransaction) {
          return requestedFrame;
        }
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
      requestedTransaction,
      resolveRetainedProjectionFrame: ({ transaction }) => {
        if (transaction === requestedTransaction) {
          return missingRequestedFrame;
        }
        throw new Error("blocked candidate must not resolve held frame");
      },
    });
    expect(heldSelection.blockedPublicationCandidate).toBeNull();
    expect(heldSelection.renderPlan).toEqual({
      heldPreviousProjection: expect.objectContaining({
        committedFrameId: 11,
        reason: "retained-projection-coverage-missing",
        requestedProjectionSampleId: requestedTransaction.sample.id,
      }),
      kind: "render",
      retainedProjectionFrame: missingRequestedFrame,
      transaction: expect.objectContaining({
        committedFrameId: 11,
        kind: "held-previous",
        rawReasons: ["retained-scroll"],
        sample: requestedTransaction.sample,
      }),
    });
    expect(heldSelection.resolvedHeldTransaction).toBeNull();
    expect(heldSelection.outcomeKind).toBe("hold-previous");

    const blockedSelection = selectProjectionFrameTransactionThroughKernel({
      previousVisibleProjectionState: visibleProjectionState({
        heldPreviousProjection: {
          ...heldProjection(),
          consecutiveFrameCount: 6,
        },
        transaction: heldTransaction,
      }),
      requestedTransaction,
      resolveRetainedProjectionFrame: ({ transaction }) => {
        if (transaction === requestedTransaction) {
          return missingRequestedFrame;
        }
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

  it("keeps retained projection transaction candidates in the kernel-owned oracle and out of render planning", () => {
    const projectionPlanSource = readFileSync(
      PROJECTION_PLAN_MODULE_PATH,
      "utf8",
    );
    const kernelModuleSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const candidateOracleSource = readFileSync(
      KERNEL_CANDIDATE_ORACLE_MODULE_PATH,
      "utf8",
    );
    const kernelAuthoritySource = [
      kernelModuleSource,
      candidateOracleSource,
    ].join("\n");

    expect(projectionPlanSource).not.toContain(
      "GpuFlowRetainedProjectionPublicationCandidate",
    );
    expect(projectionPlanSource).not.toContain(
      "selectGpuFlowProjectionFrameTransactionFromPublicationCandidate",
    );
    expect(projectionPlanSource).not.toContain(
      "createGpuFlowProjectionFrameTransactionSelector",
    );
    expect(kernelAuthoritySource).toContain(
      "GpuFlowRetainedProjectionPublicationCandidate",
    );
    expect(candidateOracleSource).toContain(
      "selectGpuFlowProjectionFrameTransactionFromPublicationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "function selectGpuFlowProjectionFrameTransactionFromPublicationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "export function selectGpuFlowProjectionFrameTransactionFromPublicationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "function prepareGpuFlowRetainedProjectionPublicationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "export function prepareGpuFlowRetainedProjectionPublicationCandidate",
    );
    expect(kernelModuleSource).toContain(
      "createGpuFlowVisiblePublicationCandidateOracle",
    );
    expect(kernelModuleSource).not.toContain(
      "createGpuFlowRetainedProjectionPublicationCandidateSelector",
    );
    expect(kernelModuleSource).not.toContain(
      "export function createGpuFlowProjectionFrameTransactionSelector",
    );
    expect(kernelModuleSource).not.toContain(
      "export function createGpuFlowRetainedProjectionPublicationCandidateSelector",
    );
    expect(candidateOracleSource).not.toContain(
      "export function createGpuFlowProjectionFrameTransactionSelector",
    );
    expect(candidateOracleSource).not.toContain(
      "export function createGpuFlowRetainedProjectionPublicationCandidateSelector",
    );
    expect(candidateOracleSource).toContain(
      "function prepareGpuFlowRetainedProjectionPublicationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
    expect(candidateOracleSource).toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
  });
});

function projectionFrame({
  missingCoverageSurfaceIds = [],
  needsRetainedPageMaintenance = false,
}: {
  readonly missingCoverageSurfaceIds?: readonly string[] | undefined;
  readonly needsRetainedPageMaintenance?: boolean | undefined;
} = {}): GpuFlowRetainedProjectionFrame {
  return {
    flatSurfaces: [],
    missingCoverageSurfaceIds: new Set(missingCoverageSurfaceIds),
    needsRetainedPageMaintenance,
  };
}

function selectProjectionFrameTransactionThroughKernel({
  previousVisibleProjectionState,
  requestedTransaction,
  resolveRetainedProjectionFrame,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
  readonly resolveRetainedProjectionFrame: (input: {
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
      requestedTransaction,
      resolveRetainedProjectionFrame: ({ transaction }) => {
        if (transaction !== requestedTransaction) {
          resolvedHeldTransaction = transaction;
        }
        return resolveRetainedProjectionFrame({ transaction });
      },
      renderProjectionFrame: ({ projectionFrameRenderPlan }) => {
        selection.renderPlan = projectionFrameRenderPlan;
        return testProjectionPublicationFrame();
      },
    }),
    publish: (transaction) => {
      selection.blockedPublicationCandidate =
        transaction.preparedFrame.motionProjectionFrame.blockedPublicationCandidate;
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
      heldPreviousRequestedSampleId: heldDebugState.requestedProjectionSampleId,
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
