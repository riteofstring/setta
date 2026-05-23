import { describe, expect, it } from "vitest";

import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import type {
  GpuFlowVisiblePublicationCompletionOutcome,
  GpuFlowVisiblePublicationDebtProof,
} from "../projectionScheduler";
import { createGpuFlowVisiblePublicationOutcomeChromeReproPayload } from "./flowVisiblePublicationOutcomeChromeRepro";
import {
  createGpuFlowVisiblePublicationCommitOracleFactory,
  type GpuFlowVisibleFramePublicationTransactionOracle,
  type GpuFlowVisiblePublicationCommitOracle,
} from "./visibleFramePublicationOracle";
import type {
  GpuFlowCommitPublicationToken,
} from "./visibleFramePublicationTokens";

const createGpuFlowVisiblePublicationCommitOracle =
  createGpuFlowVisiblePublicationCommitOracleFactory();

describe("GPU Flow visible publication Chrome repro payload", () => {
  it("records committed coverage proof counts with the visible outcome", () => {
    const sample = liveProjectionSample();
    const visibleProjectionState = {
      committedFrame: {
        actorGenerations: [
          {
            actorFamily: "text-like-dom-control",
            actorId: "actor-a",
            browserVisual: {
              proof: {
                actualInteraction: "inactive-visual-only",
                actualVisual: "compatible-previous",
                requiredInteraction: "inactive-visual-only",
                requiredVisual: "browser-visual",
              },
            },
            canonicalActorId: "canonical-text-a",
            visibleNonempty: true,
            textCoverageProof: {
              compatiblePreviousProof: {
                budgetState: "within-budget",
                hitMappingCompatible: true,
                maxProofAgeFrames: 2,
                maxProofAgeMs: 120,
                previousCommittedFrameId: 6,
                previousProjectionSampleRevision: "viewport-previous",
                proofAgeFrames: 1,
                proofAgeMs: 16,
                protectedResourceIds: ["source:actor-a"],
                reasonCode: "same-value-and-geometry",
                requestedProjectionSampleRevision: "viewport-current",
                retainedScrollCompatible: true,
              },
              projectionCoverage: "compatible-previous",
            },
          },
          {
            actorFamily: "text-like-dom-control",
            actorId: "actor-b",
            browserVisual: {
              proof: {
                actualInteraction: "active-editor-live",
                actualVisual: "exact-live-host",
                requiredInteraction: "active-editor-live",
                requiredVisual: "browser-visual",
              },
            },
            canonicalActorId: "canonical-text-b",
            visibleNonempty: true,
          },
          {
            actorFamily: "dom-island",
            actorId: "island-a",
            browserVisual: {
              proof: {
                actualInteraction: "live-hit-compatible",
                actualVisual: "exact-live-host",
                requiredInteraction: "live-hit-compatible",
                requiredVisual: "browser-visual",
              },
            },
            canonicalActorId: "canonical-island-a",
          },
        ],
        displayFrameId: 7,
        presentationProof: presentationProof(),
        projectionHorizon: {
          textActorCoverage: {
            blockedAwaitingBrowserVisualActorIds: [],
            blockedAwaitingLiveHostActorIds: [],
            compatiblePreviousActorIds: ["actor-a"],
            exactLiveDomActorIds: ["actor-b", "island-a"],
            exactSnapshotActorIds: [],
            trueHoleActorIds: [],
          },
        },
        publishability: {
          blockingActorIds: [],
          kind: "publishable",
        },
        surfaceTransaction: {
          coverageProof: {
            blockingGenerationIds: ["generation-blocked"],
            blockingSurfaceIds: ["surface-blocked"],
            compatibleCoverage: [
              {
                resourceHandles: [],
              },
            ],
            exactCoverage: [
              {
                resourceHandles: [],
              },
              {
                resourceHandles: [],
              },
            ],
            protectedResourceHandles: [
              { id: "source-a", kind: "source", reason: "interactive-source" },
            ],
            rendererBuckets: ["native-control", "retained-page"],
            trueHoleRects: [{ height: 1, width: 1, x: 0, y: 0 }],
            visibleRects: [
              { height: 1, width: 1, x: 0, y: 0 },
              { height: 2, width: 2, x: 2, y: 2 },
            ],
            zOrder: ["surface-a", "surface-b", "surface-c"],
          },
        },
      },
      transaction: {
        id: "transaction-a",
        kind: "content-publication",
      },
    } as unknown as GpuFlowVisibleProjectionState;
    const commitOracle = createGpuFlowVisiblePublicationCommitOracle({
      committedFrame: visibleProjectionState.committedFrame,
      publicationDecision: publicationDecision(sample),
    });

    expect(
      createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
        completion: {
          debt: { content: false, maintenance: true, motion: false },
          outcome: "commit",
        },
        outcome: commitOutcome({
          debtProof: { content: true, maintenance: false, motion: false },
          sample,
        }),
        previousCommittedFrameId: 6,
        publicationDecision: publicationDecision(sample),
        transactionOracle: transactionOracle({ commitOracle }),
        visibleProjectionState,
      }),
    ).toEqual(
      expect.objectContaining({
        actorProofDigest: expect.any(String),
        actorProofs: expect.any(Array),
        browserActorProofs: {
          actorCount: 3,
          canonicalActorCount: 3,
          actorFamily: {
            "dom-island": 1,
            "text-like-dom-control": 2,
          },
          actualInteraction: {
            "active-editor-live": 1,
            "inactive-visual-only": 1,
            "live-hit-compatible": 1,
          },
          actualVisual: {
            "compatible-previous": 1,
            "exact-live-host": 2,
          },
          requiredInteraction: {
            "active-editor-live": 1,
            "inactive-visual-only": 1,
            "live-hit-compatible": 1,
          },
          requiredVisual: {
            "browser-visual": 3,
          },
        },
        compatiblePreviousProofs: {
          actorCount: 1,
          maxObservedProofAgeFrames: 1,
          maxObservedProofAgeMs: 16,
          overBudgetActorIds: [],
          samples: [
            expect.objectContaining({
              actorFamily: "text-like-dom-control",
              actorId: "actor-a",
              budgetState: "within-budget",
              canonicalActorId: "canonical-text-a",
              maxProofAgeFrames: 2,
              maxProofAgeMs: 120,
              previousCommittedFrameId: 6,
              proofAgeFrames: 1,
              proofAgeMs: 16,
              protectedResourceIds: ["source:actor-a"],
              reasonCode: "same-value-and-geometry",
            }),
          ],
        },
        coverage: {
          blockingGenerationCount: 1,
          blockingSurfaceCount: 1,
          compatibleCoverageCount: 1,
          exactCoverageCount: 2,
          protectedResourceCount: 1,
          rendererBucketCount: 2,
          trueHoleRectCount: 1,
          visibleRectCount: 2,
          zOrderCount: 3,
        },
        outcome: "commit",
        previousCommittedFrameId: 6,
        remainingActorDebt: [
          {
            actorId: "actor-a",
            canonicalActorId: "canonical-text-a",
            ownerFamily: "text-like-dom-control",
            remainingDebt: ["exact-browser-visual"],
          },
        ],
        transactionId: "transaction-a",
        transactionOracle: {
          blockedProof: null,
          blockedSource: null,
          hasCommitOracle: true,
          hasPresentableCommit: true,
          renderedVisibleFrame: true,
          visibleProjectionSource: "content-publication",
        },
        visibleTransaction: {
          inputSampleId: 11,
          outcome: "commit",
          presentableCommit: {
            expectedActorSetDigest: "actors",
            presentationPairDigest: "presentation",
            proofDigest: "proof",
          },
          presentationProof: {
            ...presentationProof(),
            projectionSampleId: 11,
          },
          previousCommittedFrameId: 6,
          token: {
            committedFrameId: 7,
            expectedActorSetDigest: "actors",
            presentationPairDigest: "presentation",
            projectionSampleId: 11,
            proofDigest: "proof",
            transactionId: "transaction-a",
          },
          transactionId: "transaction-a",
          visibleCommittedFrameId: 7,
        },
        visibleCommittedFrameId: 7,
      }),
    );
  });
});

function transactionOracle({
  commitOracle,
}: {
  readonly commitOracle: GpuFlowVisiblePublicationCommitOracle;
}): GpuFlowVisibleFramePublicationTransactionOracle {
  return {
    blockedPublicationCandidate: null,
    blockedProof: null,
    blockedSource: null,
    commitOracle,
    renderedVisibleFrame: true,
    visibleProjectionSource: "content-publication",
    visibleProjectionState: {} as GpuFlowVisibleProjectionState,
  };
}

function commitOutcome({
  debtProof,
  sample,
}: {
  readonly debtProof: GpuFlowVisiblePublicationDebtProof;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisiblePublicationCompletionOutcome {
  const frame = {
    actorGenerations: [],
    displayFrameId: 7,
    surfaceTransaction: null,
  };
  return {
    debtProof,
    kind: "commit",
    token: {
      committedFrameId: frame.displayFrameId,
      expectedActorSetDigest: "actors",
      presentationPairDigest: "presentation",
      projectionSampleId: sample.id,
      proofDigest: "proof",
      transactionId: "transaction-a",
    } as GpuFlowCommitPublicationToken,
  };
}

function publicationDecision(
  sample: GpuFlowLiveProjectionSample,
): GpuFlowVisiblePublicationDecision {
  return {
    debt: { content: false, maintenance: true, motion: false },
    lane: "content",
    rawReasons: ["manual"],
    sample,
    schedulerState: "content-catchup",
  };
}

function presentationProof() {
  const presentationBatchId = "presentation:7";
  return {
    actorManifestDigest: "manifest-digest",
    batchId: presentationBatchId,
    browserVisualFragmentDigest: "browser-visual-fragment-digest",
    canvasGeneration: {
      canvasRetainedFrameId: 7,
      debugSnapshotFrameId: 7,
      exposable: true,
      gpuNativeVisualCommittedFrameId: 7,
      htmlTextureOverlayCommittedFrameId: 7,
      prepared: true,
      presentationBatchId,
    },
    domGeneration: {
      browserVisualCommittedFrameId: 7,
      domControlCommittedFrameId: 7,
      domIslandCommittedFrameId: 7,
      exposable: true,
      presentationBatchId,
      staged: true,
    },
    surfaceTransactionDigest: "surface-transaction-digest",
  };
}

function liveProjectionSample(): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id: 11,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp: 25,
    viewport: [0, 0, 1],
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}
