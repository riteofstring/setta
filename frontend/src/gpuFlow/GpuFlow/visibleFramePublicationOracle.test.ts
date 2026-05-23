import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { freezeActor } from "../committedSurfaceActorFreeze";
import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceActorGeneration,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionTransactionKind,
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFramePublicationKernel";
import {
  createGpuFlowVisibleFramePublicationTransactionOracle,
  createGpuFlowVisiblePublicationCommitOracle,
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
    expect(oracleSource).not.toContain(
      "function createGpuFlowMotionProjectionBlockedPublicationCandidate",
    );
    expect(oracleSource).toContain(
      "createGpuFlowVisibleFramePublicationOracleBlockedProof",
    );
    expect(oracleSource).toContain(
      "createGpuFlowVisibleFramePublicationOracleProjectionSource",
    );
    expect(oracleSource).toContain(
      "motionProjectionFrame.blockedPublicationCandidate",
    );
    expect(oracleSource).toContain(
      "type GpuFlowVisiblePublicationBlockedProof",
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
    const motionBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "motion-projection-blocked",
        heldPreviousProjectionState: null,
      });

    const oracle = createGpuFlowVisibleFramePublicationTransactionOracle({
      contentPublicationFrame: {
        blockedPublicationCandidate: contentBlockedCandidate,
        visibleProjectionState: contentVisibleState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: motionBlockedCandidate,
        visibleProjectionState: motionVisibleState,
      },
      publicationDecision: publicationDecision(contentVisibleState.sample),
    });

    expect(oracle.blockedPublicationCandidate).toBe(contentBlockedCandidate);
    expect(oracle.blockedProof).toEqual({
      blockedReasons: contentBlockedCandidate.blockedReasons,
      candidate: contentBlockedCandidate,
      frozenFrameId: contentBlockedCandidate.frozenFrameId,
      source: "content-publication",
    });
    expect(oracle.blockedSource).toBe("content-publication");
    expect(oracle.commitOracle).not.toBeNull();
    expect(oracle.commitOracle?.debtProof.content).toBe(true);
    expect(oracle.renderedVisibleFrame).toBe(true);
    expect(oracle.visibleProjectionSource).toBe("content-publication");
    expect(oracle.visibleProjectionState).toBe(contentVisibleState);
  });

  it("reports authoritative per-actor visual and interaction proof entries", () => {
    const sample = liveProjectionSample({ id: 45, timestamp: 450 });
    const actor = retainedDomControlActor();
    const oracle = createGpuFlowVisiblePublicationCommitOracle({
      committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
      publicationDecision: publicationDecision(sample),
    });

    expect(oracle.actorProofs).toEqual([
      expect.objectContaining({
        actorId: "control-a",
        actualInteractionProof: "blocked",
        actualVisualProof: "compatible-previous",
        canonicalActorId: actor.canonicalActorId,
        contentGenerationId: "content-a",
        ownerFamily: "text-like-dom-control",
        ownerSurfaceId: "surface-a",
        projectionGenerationId: "layout-a",
        projectionSampleId: sample.id,
        proofState: "blocked",
        remainingDebt: ["exact-browser-visual", "active-editor"],
        requiredInteractionRepresentation: "active-editor-live",
        requiredVisualRepresentation: "browser-visual",
        sampledVisualEvidence: "compatible-previous",
      }),
    ]);
    expect(oracle.actorProofDigest).toContain("text-like-dom-control");
    expect(oracle.browserActorProofs.actualVisual).toEqual({
      "compatible-previous": 1,
    });
  });

  it.each(["exact-live-host", "same-live-host-compatible-projection"] as const)(
    "accepts active-editor motion proof from %s",
    (actualVisualProof) => {
      const sample = liveProjectionSample({ id: 49, timestamp: 490 });
      const actor = retainedDomControlActor({
        actualInteractionProof: "active-editor-live",
        actualVisualProof,
      });
      const oracle = createGpuFlowVisiblePublicationCommitOracle({
        committedFrame: committedSurfaceFrame({ actorGenerations: [actor] }),
        publicationDecision: publicationDecision(sample),
      });

      expect(oracle.actorProofs).toEqual([
        expect.objectContaining({
          actualInteractionProof: "active-editor-live",
          actualVisualProof,
          proofState: "exact",
          remainingDebt: [],
          requiredInteractionRepresentation: "active-editor-live",
          requiredVisualRepresentation: "browser-visual",
          sampledVisualEvidence: actualVisualProof,
        }),
      ]);
      expect(oracle.browserActorProofs.actualInteraction).toEqual({
        "active-editor-live": 1,
      });
    },
  );

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
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: motionVisibleState,
      },
      publicationDecision: publicationDecision(contentVisibleState.sample),
    });

    expect(prepared.renderedVisibleFrame).toBe(true);
    expect(prepared.visibleProjectionState).toBe(contentVisibleState);
    expect(prepared.commitOracle?.debtProof.content).toBe(true);
  });

  it("selects content blocked candidates over motion projection blocks", () => {
    const contentBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "content-publication-blocked",
        heldPreviousProjectionState: null,
      });
    const motionBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "motion-projection-blocked",
        heldPreviousProjectionState: null,
      });

    const prepared = selectGpuFlowVisibleFramePublicationPreparedFrame({
      contentPublicationFrame: {
        blockedPublicationCandidate: contentBlockedCandidate,
        visibleProjectionState: null,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: motionBlockedCandidate,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(
        liveProjectionSample({ id: 46, timestamp: 460 }),
      ),
    });

    expect(prepared.blockedPublicationCandidate).toBe(contentBlockedCandidate);
    expect(prepared.blockedProof).toEqual({
      blockedReasons: contentBlockedCandidate.blockedReasons,
      candidate: contentBlockedCandidate,
      frozenFrameId: contentBlockedCandidate.frozenFrameId,
      source: "content-publication",
    });
    expect(prepared.commitOracle).toBeNull();
    expect(prepared.renderedVisibleFrame).toBe(false);
  });

  it("uses prepared motion projection blocked candidates", () => {
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 42, timestamp: 420 }),
    });
    const motionBlockedCandidate =
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: "held-previous-budget-exceeded",
        heldPreviousProjectionState: previousVisibleProjectionState,
      });

    const prepared = selectGpuFlowVisibleFramePublicationPreparedFrame({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: motionBlockedCandidate,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(
        liveProjectionSample({ id: 47, timestamp: 470 }),
      ),
    });

    expect(prepared.renderedVisibleFrame).toBe(false);
    expect(prepared.commitOracle).toBeNull();
    expect(prepared.blockedPublicationCandidate).toBe(motionBlockedCandidate);
    expect(prepared.blockedProof).toEqual({
      blockedReasons: motionBlockedCandidate.blockedReasons,
      candidate: motionBlockedCandidate,
      frozenFrameId: motionBlockedCandidate.frozenFrameId,
      source: "motion-projection",
    });
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
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      publicationDecision: publicationDecision(
        liveProjectionSample({ id: 48, timestamp: 480 }),
      ),
    });

    expect(prepared).toEqual({
      blockedPublicationCandidate: null,
      blockedProof: null,
      commitOracle: null,
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

function committedSurfaceFrame({
  actorGenerations = [],
}: {
  readonly actorGenerations?: readonly GpuFlowCommittedSurfaceActorGeneration[];
} = {}): GpuFlowCommittedSurfaceFrame {
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
    actorGenerations,
    coherence,
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      actorGenerations,
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

function retainedDomControlActor({
  actualInteractionProof = "blocked",
  actualVisualProof = "compatible-previous",
}: {
  readonly actualInteractionProof?: string | undefined;
  readonly actualVisualProof?: string | undefined;
} = {}): GpuFlowCommittedSurfaceActorGeneration {
  return freezeActor({
    active: true,
    actorFamily: "text-like-dom-control",
    actorId: "control-a",
    browserVisual: {
      coverageExemption: null,
      coverageRequired: {
        reason: "active-editor",
        required: true,
      },
      coverageState:
        actualVisualProof === "compatible-previous"
          ? "compatible-previous-ready"
          : "live-host-ready",
      nonemptyReason: "value-text",
      proof: {
        actualInteraction: actualInteractionProof,
        actualVisual: actualVisualProof,
        requiredInteraction: "active-editor-live",
        requiredVisual: "browser-visual",
      },
      representation:
        actualVisualProof === "compatible-previous"
          ? {
              actorId: "control-a",
              kind: "compatible-previous",
              previousTransactionId: "previous-transaction",
            }
          : {
              actorId: "control-a",
              hostId: "host-a",
              islandId: "island-a",
              kind: "active-editor",
            },
      representationKind:
        actualVisualProof === "compatible-previous"
          ? "compatible-previous"
          : "active-editor",
      resourceHandles: [],
      visibilityReason: "visible",
    } as GpuFlowCommittedSurfaceActorGeneration["browserVisual"],
    clipChainRevision: "clip-a",
    clipRect: rect(),
    contentGenerationId: "content-a",
    controlId: "control-a",
    focusIdentity: "control-a",
    flowRect: rect(),
    generationId: "generation-a",
    islandId: null,
    kind: "dom-control",
    layoutProjectionGenerationId: "layout-a",
    liveMotionSampleId: "sample-a",
    mountReadiness: "ready",
    ownerSurfaceId: "surface-a",
    pointerEvents: "auto",
    projectionReadiness: "ready",
    readinessGenerationId: "ready-a",
    retainedScrollOffset: null,
    retainedScrollRevision: 1,
    rowId: "row-a",
    sourceRect: rect(),
    valueStyleRevision: "value-style-a",
    visibleNonempty: true,
    wheelPolicy: "retained-scroll-or-editor-scroll",
    zOrder: 1,
  });
}

function rect() {
  return { height: 20, width: 100, x: 0, y: 0 };
}

function publicationDecision(
  sample: GpuFlowLiveProjectionSample,
): GpuFlowVisiblePublicationDecision {
  return {
    debt: { content: true, maintenance: false, motion: false },
    lane: "content",
    rawReasons: ["manual"],
    sample,
    schedulerState: "idle",
  };
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
