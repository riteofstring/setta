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
import type {
  GpuFlowVisibleFrameEngineOutcome,
  GpuFlowVisibleFramePreparedFrame,
} from "./visibleFrameEngine";
import { createGpuFlowVisiblePublicationOutcomeChromeReproPayload } from "./visibleFrameOutcomeChromeRepro";
import { createGpuFlowVisiblePublicationCanvasPresentationEvidence } from "./visibleFramePresentationEvidence";
import type { GpuFlowCommitPublicationToken } from "./visibleFramePresentationProofs";
import {
  createGpuFlowVisiblePublicationCommitProofFactory,
  type GpuFlowVisibleFramePublicationTransactionProof,
  type GpuFlowVisiblePublicationCommitProof,
} from "./visibleFrameTransactionProofs";

const createGpuFlowVisiblePublicationCommitProofFromFactory =
  createGpuFlowVisiblePublicationCommitProofFactory();
const createGpuFlowVisiblePublicationCommitProof = ({
  committedFrame,
  publicationDecision,
}: {
  readonly committedFrame: Parameters<
    typeof createGpuFlowVisiblePublicationCommitProofFromFactory
  >[0]["committedFrame"];
  readonly publicationDecision: Parameters<
    typeof createGpuFlowVisiblePublicationCommitProofFromFactory
  >[0]["publicationDecision"];
}) => {
  const projectionTransactionId = "transaction-a";
  return createGpuFlowVisiblePublicationCommitProofFromFactory({
    committedFrame,
    presentationEvidence: {
      canvasGenerationEvidence:
        createGpuFlowVisiblePublicationCanvasPresentationEvidence({
          committedFrame,
          projectionSampleId: publicationDecision.sample.id,
          projectionTransactionId,
        }),
    },
    publicationDecision,
    projectionTransactionId,
  });
};

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
              representation: {
                actorId: "actor-a",
                kind: "compatible-previous",
                previousTransactionId: "previous-transaction",
              },
            },
            canonicalActorId: "canonical-text-a",
            visibleNonempty: true,
            textCoverageProof: {
              compatiblePreviousProof: {
                budgetState: "within-budget",
                clipChainRevision: "clip-a",
                hitMappingCompatible: true,
                maxProofAgeFrames: 2,
                maxProofAgeMs: 120,
                previousActorGenerationId: "previous-generation-a",
                previousCommittedFrameId: 6,
                previousProjectionSampleRevision: "viewport-previous",
                previousTransactionId: "previous-transaction",
                previousVisualGenerationId: "previous-visual-a",
                proofAgeFrames: 1,
                proofAgeMs: 16,
                protectedResourceIds: ["source:actor-a"],
                reasonCode: "same-value-and-geometry",
                requestedActorGenerationId: "generation-a",
                requestedProjectionSampleRevision: "viewport-current",
                requestedVisualGenerationId: "generation-a",
                resourceHandles: [{ id: "source-a", kind: "source" }],
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
              representation: {
                actorId: "actor-b",
                hostId: "host-b",
                islandId: "island-a",
                kind: "active-editor",
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
    const commitProof = createGpuFlowVisiblePublicationCommitProof({
      committedFrame: visibleProjectionState.committedFrame,
      publicationDecision: publicationDecision(sample),
    });
    const payload = createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
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
      transactionProof: transactionProof({ commitProof }),
      visibleProjectionState,
    });

    expect(JSON.stringify(payload).length).toBeLessThan(12000);
    expect(payload).toEqual(
      expect.objectContaining({
        actorProofCount: 2,
        actorProofDigest: expect.objectContaining({
          length: expect.any(Number),
          preview: expect.any(String),
          truncated: expect.any(Boolean),
        }),
        actorProofSamples: expect.arrayContaining([
          expect.objectContaining({
            actorId: "actor-a",
            browserVisualRepresentation: expect.objectContaining({
              kind: "compatible-previous",
              previousTransactionId: "previous-transaction",
            }),
          }),
          expect.objectContaining({
            actorId: "actor-b",
            browserVisualRepresentation: expect.objectContaining({
              hostId: "host-b",
              kind: "active-editor",
            }),
          }),
        ]),
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
              clipChainRevision: "clip-a",
              maxProofAgeFrames: 2,
              maxProofAgeMs: 120,
              previousActorGenerationId: "previous-generation-a",
              previousCommittedFrameId: 6,
              previousTransactionId: "previous-transaction",
              previousVisualGenerationId: "previous-visual-a",
              proofAgeFrames: 1,
              proofAgeMs: 16,
              protectedResourceIds: ["source:actor-a"],
              reasonCode: "same-value-and-geometry",
              requestedActorGenerationId: "generation-a",
              requestedLiveProjectionSampleId: sample.id,
              requestedProjectionSampleRevision: "viewport-current",
              requestedVisualGenerationId: "generation-a",
              resourceHandleIds: ["source-a"],
              retainedScrollCompatible: true,
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
        resourceProtection: expect.objectContaining({
          missingResourceKeys: [],
          protected: true,
          protectedResourceKeys: [
            expect.objectContaining({
              preview: "source:source-a",
              truncated: false,
            }),
          ],
          requiredResourceKeys: [
            expect.objectContaining({
              preview: "source:source-a",
              truncated: false,
            }),
          ],
        }),
        transactionId: "transaction-a",
        transactionProof: {
          blockedProof: null,
          blockedSource: null,
          hasCommitProof: true,
          hasPresentableCommit: true,
          renderedVisibleFrame: true,
          visibleFrameEngineOutcome: {
            decidingProof: null,
            kind: "presented",
          },
          visibleProjectionSource: "content-publication",
        },
        visibleTransaction: {
          inputSampleId: 11,
          outcome: "commit",
          presentableCommit: expect.objectContaining({
            presentationPairProof: expect.objectContaining({
              actorManifestDigest: expect.objectContaining({
                preview: "manifest-digest",
                truncated: false,
              }),
              batchId: expect.objectContaining({
                preview: "presentation:7",
                truncated: false,
              }),
              projectionSampleId: 11,
            }),
            resourceProtectionDigest: expect.objectContaining({
              preview: "resource",
              truncated: false,
            }),
          }),
          presentationProof: expect.objectContaining({
            actorManifestDigest: expect.objectContaining({
              preview: "manifest-digest",
              truncated: false,
            }),
            batchId: expect.objectContaining({
              preview: "presentation:7",
              truncated: false,
            }),
            projectionSampleId: 11,
          }),
          previousCommittedFrameId: 6,
          token: expect.objectContaining({
            committedFrameId: 7,
            presentationPairProof: expect.objectContaining({
              actorManifestDigest: expect.objectContaining({
                preview: "manifest-digest",
                truncated: false,
              }),
              batchId: expect.objectContaining({
                preview: "presentation:7",
                truncated: false,
              }),
              projectionSampleId: 11,
            }),
            projectionSampleId: 11,
            resourceProtectionDigest: expect.objectContaining({
              preview: "resource",
              truncated: false,
            }),
            transactionId: "transaction-a",
          }),
          transactionId: "transaction-a",
          visibleCommittedFrameId: 7,
        },
        visibleCommittedFrameId: 7,
      }),
    );
  });
});

function transactionProof({
  commitProof,
}: {
  readonly commitProof: GpuFlowVisiblePublicationCommitProof;
}): GpuFlowVisibleFramePublicationTransactionProof {
  return {
    blockedPublicationCandidate: null,
    blockedProof: null,
    blockedSource: null,
    commitProof,
    renderedVisibleFrame: true,
    visibleFrameEngineOutcome: {
      decidingProof: null,
      kind: "presented",
    } as GpuFlowVisibleFrameEngineOutcome,
    visibleFrameEnginePreparedFrame: {} as GpuFlowVisibleFramePreparedFrame,
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
      presentationPairProof: {
        ...presentationProof(sample.id),
        projectionSampleId: sample.id,
      },
      projectionSampleId: sample.id,
      proofDigest: "proof",
      resourceProtectionDigest: "resource",
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

function presentationProof(projectionSampleId = 10) {
  const presentationBatchId = "presentation:7";
  return {
    actorManifestDigest: "manifest-digest",
    batchId: presentationBatchId,
    browserVisualFragmentDigest: "browser-visual-fragment-digest",
    canvasGenerationEvidence: {
      committedFrameId: 7,
      exposable: true,
      prepared: true,
      presentationBatchId,
      projectionSampleId,
      projectionTransactionId: "transaction-a",
      source: "deferred-canvas-submission",
    },
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
    domGenerationEvidence: {
      browserVisualCandidateId: "browser-visual-candidate:7:7",
      committedFrameId: 7,
      domControlMountedCount: 0,
      domControlSnapshotCount: 0,
      domIslandCount: 0,
      exposable: true,
      runtimeFrameId: 7,
      source: "browser-visual-runtime-candidate",
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
