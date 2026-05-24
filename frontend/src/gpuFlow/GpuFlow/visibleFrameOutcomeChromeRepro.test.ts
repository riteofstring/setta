import { describe, expect, it } from "vitest";

import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleFrameReducerDecision,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuFlowVisibleFramePresentationOutcomeChromeReproPayload } from "./visibleFrameOutcomeChromeRepro";
import {
  createGpuFlowVisibleFramePresentationCanvasPresentationEvidence,
  createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence,
  createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence,
} from "./visibleFramePresentationEvidence";
import type { GpuFlowVisibleFramePresentationToken } from "./visibleFramePresentationProofs";
import type {
  GpuFlowVisibleFrameReducerCompletionOutcome,
  GpuFlowVisibleFrameReducerDebtProof,
} from "./visibleFrameReducerRuntime";
import type {
  GpuFlowVisibleFramePreparedFrame,
  GpuFlowVisibleFrameStateMachineOutcome,
} from "./visibleFrameStateMachine";
import {
  createGpuFlowVisibleFramePresentableFrameProofFactory,
  type GpuFlowVisibleFramePresentableFrameProof,
  type GpuFlowVisibleFramePresentationTransactionProof,
} from "./visibleFrameTransactionProofs";
import {
  createGpuFlowContentFrameId,
  createGpuFlowPresentationId,
} from "./visibleFrameTypes";

const createGpuFlowVisibleFramePresentableFrameProofFromFactory =
  createGpuFlowVisibleFramePresentableFrameProofFactory();
const createGpuFlowVisibleFramePresentableFrameProof = ({
  preparedContentFrame,
  reducerDecision,
}: {
  readonly preparedContentFrame: Parameters<
    typeof createGpuFlowVisibleFramePresentableFrameProofFromFactory
  >[0]["preparedContentFrame"];
  readonly reducerDecision: Parameters<
    typeof createGpuFlowVisibleFramePresentableFrameProofFromFactory
  >[0]["reducerDecision"];
}) => {
  const projectionTransactionId = "transaction-a";
  return createGpuFlowVisibleFramePresentableFrameProofFromFactory({
    preparedContentFrame,
    presentationEvidence: {
      canvasGenerationEvidence:
        createGpuFlowVisibleFramePresentationCanvasPresentationEvidence({
          preparedContentFrame,
          projectionSampleId: reducerDecision.sample.id,
          projectionTransactionId,
        }),
      domTransformEvidence:
        createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence({
          preparedContentFrame,
          projectionSampleId: reducerDecision.sample.id,
          projectionTransactionId,
        }),
      textureEvictionEvidence:
        createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence(
          {
            preparedContentFrame,
            projectionSampleId: reducerDecision.sample.id,
            projectionTransactionId,
          },
        ),
    },
    reducerDecision,
    projectionTransactionKind: "prepared-content",
    projectionTransactionId,
  });
};

describe("GPU Flow visible frame presentation Chrome repro payload", () => {
  it("records presented coverage proof counts with the visible outcome", () => {
    const sample = liveProjectionSample();
    const visibleProjectionState = {
      preparedContentFrame: {
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
                previousContentFrameId: 6,
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
        kind: "prepared-content",
      },
    } as unknown as GpuFlowVisibleProjectionState;
    const presentableFrameProof =
      createGpuFlowVisibleFramePresentableFrameProof({
        preparedContentFrame: visibleProjectionState.preparedContentFrame,
        reducerDecision: reducerDecision(sample),
      });
    const payload =
      createGpuFlowVisibleFramePresentationOutcomeChromeReproPayload({
        completion: {
          debt: { content: false, maintenance: true, motion: false },
          outcome: "present",
        },
        outcome: presentOutcome({
          debtProof: { content: true, maintenance: false, motion: false },
          sample,
        }),
        previousContentFrameId: 6,
        reducerDecision: reducerDecision(sample),
        transactionProof: transactionProof({ presentableFrameProof }),
        visibleProjectionState,
      });

    expect(JSON.stringify(payload).length).toBeLessThan(12100);
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
              previousContentFrameId: 6,
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
        outcome: "present",
        previousContentFrameId: 6,
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
          requiredResourceKeys: [],
        }),
        transactionId: "transaction-a",
        transactionProof: {
          blockedProof: null,
          blockedSource: null,
          hasPresentableFrameProof: true,
          hasPresentableFrame: true,
          renderedVisibleFrame: true,
          visibleFrameStateMachineOutcome: {
            decidingProof: null,
            kind: "presented",
          },
          visibleProjectionSource: "prepared-content",
        },
        visibleTransaction: {
          inputSampleId: 11,
          outcome: "present",
          presentableFrame: expect.objectContaining({
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
          previousContentFrameId: 6,
          token: expect.objectContaining({
            preparedContentFrameId: 7,
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
          visiblePreparedContentFrameId: 7,
        },
        visiblePreparedContentFrameId: 7,
      }),
    );
  });
});

function transactionProof({
  presentableFrameProof,
}: {
  readonly presentableFrameProof: GpuFlowVisibleFramePresentableFrameProof;
}): GpuFlowVisibleFramePresentationTransactionProof {
  return {
    blockedPresentationCandidate: null,
    blockedProof: null,
    blockedSource: null,
    presentableFrameProof,
    renderedVisibleFrame: true,
    visibleFrameStateMachineOutcome: {
      decidingProof: null,
      kind: "presented",
    } as GpuFlowVisibleFrameStateMachineOutcome,
    visibleFrameStateMachinePreparedFrame:
      {} as GpuFlowVisibleFramePreparedFrame,
    visibleProjectionSource: "prepared-content",
    visibleProjectionState: {} as GpuFlowVisibleProjectionState,
  };
}

function presentOutcome({
  debtProof,
  sample,
}: {
  readonly debtProof: GpuFlowVisibleFrameReducerDebtProof;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleFrameReducerCompletionOutcome {
  const frame = {
    actorGenerations: [],
    displayFrameId: 7,
    surfaceTransaction: null,
  };
  return {
    debtProof,
    kind: "present",
    token: {
      preparedContentFrameId: frame.displayFrameId,
      contentFrameId: createGpuFlowContentFrameId(String(frame.displayFrameId)),
      expectedActorSetDigest: "actors",
      presentationId: createGpuFlowPresentationId("presentation-a"),
      presentationPairDigest: "presentation",
      presentationPairProof: {
        ...presentationProof(sample.id),
        projectionSampleId: sample.id,
      },
      projectionSampleId: sample.id,
      proofDigest: "proof",
      resourceProtectionDigest: "resource",
      transactionId: "transaction-a",
    } as unknown as GpuFlowVisibleFramePresentationToken,
  };
}

function reducerDecision(
  sample: GpuFlowLiveProjectionSample,
): GpuFlowVisibleFrameReducerDecision {
  return {
    debt: { content: false, maintenance: true, motion: false },
    lane: "content",
    rawReasons: ["manual"],
    sample,
    reducerState: "content-catchup",
  };
}

function presentationProof(projectionSampleId = 10) {
  const presentationBatchId = "presentation:7";
  return {
    actorManifestDigest: "manifest-digest",
    batchId: presentationBatchId,
    browserVisualFragmentDigest: "browser-visual-fragment-digest",
    canvasGenerationEvidence: {
      preparedContentFrameId: 7,
      exposable: true,
      prepared: true,
      presentationBatchId,
      projectionSampleId,
      projectionTransactionId: "transaction-a",
      source: "deferred-canvas-submission",
    },
    domTransformEvidence: {
      preparedContentFrameId: 7,
      prepared: true,
      projectionSampleId,
      projectionTransactionId: "transaction-a",
      source: "deferred-dom-transform-submission",
    },
    textureEvictionEvidence: {
      preparedContentFrameId: 7,
      prepared: true,
      projectionSampleId,
      projectionTransactionId: "transaction-a",
      source: "deferred-texture-eviction-submission",
    },
    canvasGeneration: {
      canvasRetainedFrameId: 7,
      debugSnapshotFrameId: 7,
      exposable: true,
      gpuNativeVisualPreparedFrameId: 7,
      htmlTextureOverlayPreparedFrameId: 7,
      prepared: true,
      presentationBatchId,
    },
    domGeneration: {
      browserVisualPreparedFrameId: 7,
      domControlPreparedFrameId: 7,
      domIslandPreparedFrameId: 7,
      exposable: true,
      presentationBatchId,
      staged: true,
    },
    domGenerationEvidence: {
      browserVisualCandidateId: "browser-visual-candidate:7:7",
      preparedContentFrameId: 7,
      domControlMountedCount: 0,
      domControlSnapshotCount: 0,
      domIslandCount: 0,
      exposable: true,
      runtimeFrameId: 7,
      source: "browser-visual-runtime-candidate",
      staged: true,
    },
    projectionTransactionKind: "prepared-content",
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
