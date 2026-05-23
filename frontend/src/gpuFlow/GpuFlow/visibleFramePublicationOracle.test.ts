import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionTransactionKind,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFramePublicationKernel";
import {
  createGpuFlowVisibleFramePublicationTransactionOracle,
  selectGpuFlowVisibleFramePublicationPreparedFrame,
} from "./visibleFramePublicationOracle";

const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationKernel.ts", import.meta.url),
);
const ORACLE_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationOracle.ts", import.meta.url),
);

describe("GPU Flow visible publication transaction oracle", () => {
  it("keeps candidate-set oracle assembly out of the kernel wrapper", () => {
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const oracleSource = readFileSync(ORACLE_MODULE_PATH, "utf8");

    expect(kernelSource).not.toContain(
      "createGpuFlowVisibleFramePublicationOracleBlockedSource",
    );
    expect(kernelSource).not.toContain(
      "createGpuFlowVisibleFramePublicationOracleProjectionSource",
    );
    expect(kernelSource).not.toContain(
      "function createGpuFlowMotionProjectionBlockedPublicationCandidate",
    );
    expect(oracleSource).toContain(
      "createGpuFlowVisibleFramePublicationOracleBlockedSource",
    );
    expect(oracleSource).toContain(
      "createGpuFlowVisibleFramePublicationOracleProjectionSource",
    );
    expect(oracleSource).toContain(
      "function createGpuFlowMotionProjectionBlockedPublicationCandidate",
    );
  });

  it("records content and motion proof sources", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 43, timestamp: 430 }),
    });
    const motionVisibleState = visibleProjectionState({
      kind: "motion-projection",
      sample: liveProjectionSample({ id: 44, timestamp: 446 }),
    });
    const contentBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "content-publication-blocked",
        heldPreviousProjectionState: null,
      });

    const oracle = createGpuFlowVisibleFramePublicationTransactionOracle({
      contentPublicationFrame: {
        blockedPublicationCandidate: contentBlockedCandidate,
        visibleProjectionState: contentVisibleState,
      },
      heldPreviousProjectionState: null,
      motionProjectionFrame: {
        blockedProjectionReason: "motion-projection-blocked",
        visibleProjectionState: motionVisibleState,
      },
    });

    expect(oracle.blockedPublicationCandidate).toBe(contentBlockedCandidate);
    expect(oracle.blockedSource).toBe("content-publication");
    expect(oracle.renderedVisibleFrame).toBe(true);
    expect(oracle.visibleProjectionSource).toBe("content-publication");
    expect(oracle.visibleProjectionState).toBe(contentVisibleState);
  });

  it("selects content visible state over motion visible state", () => {
    const contentVisibleState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 40, timestamp: 400 }),
    });
    const motionVisibleState = visibleProjectionState({
      kind: "motion-projection",
      sample: liveProjectionSample({ id: 41, timestamp: 416 }),
    });

    const prepared = selectGpuFlowVisibleFramePublicationPreparedFrame({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: contentVisibleState,
      },
      heldPreviousProjectionState: null,
      motionProjectionFrame: {
        blockedProjectionReason: null,
        visibleProjectionState: motionVisibleState,
      },
    });

    expect(prepared.renderedVisibleFrame).toBe(true);
    expect(prepared.visibleProjectionState).toBe(contentVisibleState);
  });

  it("selects content blocked candidates over motion projection blocks", () => {
    const contentBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "content-publication-blocked",
        heldPreviousProjectionState: null,
      });

    const prepared = selectGpuFlowVisibleFramePublicationPreparedFrame({
      contentPublicationFrame: {
        blockedPublicationCandidate: contentBlockedCandidate,
        visibleProjectionState: null,
      },
      heldPreviousProjectionState: null,
      motionProjectionFrame: {
        blockedProjectionReason: "motion-projection-blocked",
        visibleProjectionState: null,
      },
    });

    expect(prepared.blockedPublicationCandidate).toBe(contentBlockedCandidate);
    expect(prepared.renderedVisibleFrame).toBe(false);
  });

  it("turns motion projection block reasons into retained-projection candidates", () => {
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 42, timestamp: 420 }),
    });

    const prepared = selectGpuFlowVisibleFramePublicationPreparedFrame({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      heldPreviousProjectionState: previousVisibleProjectionState,
      motionProjectionFrame: {
        blockedProjectionReason: "held-previous-budget-exceeded",
        visibleProjectionState: null,
      },
    });

    expect(prepared.renderedVisibleFrame).toBe(false);
    expect(prepared.blockedPublicationCandidate?.frozenFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(prepared.blockedPublicationCandidate?.blockedReasons).toEqual([
      {
        actorId: null,
        family: "retained-projection",
        reason: "held-previous-budget-exceeded",
      },
    ]);
  });

  it("reports no rendered visible frame when content and motion do not prepare one", () => {
    const prepared = selectGpuFlowVisibleFramePublicationPreparedFrame({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      heldPreviousProjectionState: null,
      motionProjectionFrame: {
        blockedProjectionReason: null,
        visibleProjectionState: null,
      },
    });

    expect(prepared).toEqual({
      blockedPublicationCandidate: null,
      renderedVisibleFrame: false,
      visibleProjectionState: null,
    });
  });
});

function visibleProjectionState({
  kind,
  sample,
}: {
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleProjectionState {
  const committedFrame = committedSurfaceFrame();
  return {
    committedFrame,
    debugState: {
      committedFrameId: committedFrame.displayFrameId,
      gestureOwner: "idle",
      heldPreviousDurationMs: 0,
      heldPreviousFrameCount: 0,
      heldPreviousOverBudget: false,
      heldPreviousReason: null,
      heldPreviousRequestedSampleId: null,
      lane: "content",
      projectionSampleId: sample.id,
      projectionTransactionId: `transaction:${kind}:${sample.id}`,
      transactionKind: kind,
    },
    heldPreviousProjection: null,
    sample,
    transaction: {
      committedFrameId: committedFrame.displayFrameId,
      id: `transaction:${kind}:${sample.id}`,
      kind,
      lane: "content",
      rawReasons: ["manual"],
      sample,
      startedAtMs: sample.timestamp,
    },
  };
}

function committedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  const displayFrameId = 7;
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip",
    debugSnapshotFrameId: displayFrameId,
    domControlCommittedFrameId: displayFrameId,
    domIslandCommittedFrameId: displayFrameId,
    gpuNativeVisualCommittedFrameId: displayFrameId,
    hitGenerationId: `hit:${displayFrameId}`,
    htmlTextureOverlayCommittedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [],
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      coherence,
      displayFrameId,
    }),
    projectionHorizon: {
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    publishability: {
      blockingActorIds: [],
      kind: "publishable",
    },
    surfaceTransaction: null,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function liveProjectionSample({
  id,
  timestamp,
}: {
  readonly id: number;
  readonly timestamp: number;
}): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp,
    viewport: [0, 0, 1],
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}
