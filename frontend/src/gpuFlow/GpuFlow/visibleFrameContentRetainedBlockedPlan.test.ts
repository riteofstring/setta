import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisiblePublicationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  runGpuFlowRetainedCommittedSurfacePublicationContentStage,
  type GpuFlowRetainedDisplayPublicationFramePlanPreparer,
} from "./visibleFrameContentPlan";

const contentDecisionKernel =
  createGpuFlowVisiblePublicationContentDecisionKernel();

describe("GPU Flow retained display candidate content plans", () => {
  it("publishes retained display candidates instead of retained projection blockers", () => {
    const retainedFrame = {} as RetainedDisplayFrame;
    const prepareRetainedDisplayPublicationFramePlan =
      createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
        contentDecisionKernel,
        previousVisibleProjectionState: null,
        prepareRetainedDisplayPublicationCandidate: () => ({
          prePublishRetainedPageMaintenance: null,
          retainedDisplayOutcome: {
            frame: retainedFrame,
            kind: "publish-exact",
          },
          retainedDisplayTransactionMs: 0,
          retainedPageMaintenanceMs: 0,
          retainedPagePreparedFrame:
            {} as RetainedContentTexturePagePreparedFrame,
        }),
      });
    const preparation = prepareRetainedDisplayPublicationFramePlan(
      retainedDisplayPublicationInputFixture(),
    );

    expect(preparation.framePlan.kind).toBe("published");
    expect(preparation.framePlanResult.blockedPublicationCandidate).toBeNull();
    expect(preparation.nodeLayerFrameResult).toBeNull();
    expect(preparation.publishedOutcomeFrame.frame).toBe(retainedFrame);
  });

  it("reports visible true-hole blockers from committed surface candidates", () => {
    const retainedFrame = {} as RetainedDisplayFrame;
    const committedFrame = trueHoleCommittedSurfaceFrame();
    const result = runGpuFlowRetainedCommittedSurfacePublicationContentStage<
      Record<string, never>,
      never
    >({
      contentDecisionKernel,
      deferBrowserVisualWakeup: false,
      deferResolutionUpdates: false,
      frameReasons: ["texture-upload"],
      liveProjectionSample: {
        id: 17,
        timestamp: 24,
      } as Parameters<
        typeof runGpuFlowRetainedCommittedSurfacePublicationContentStage
      >[0]["liveProjectionSample"],
      onCommittedSurfaceCandidateAccepted: () => {
        throw new Error("Blocked committed candidates must not publish.");
      },
      onRetainedDisplayCandidateAccepted: () => ({
        committedGpuNativeVisuals: undefined,
        context: {},
      }),
      prepareCommittedSurfaceFrame: () => committedFrame,
      prepareCommittedSurfacePublicationFramePlan:
        createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
          contentDecisionKernel,
        }),
      prepareRetainedDisplayPublicationFramePlan:
        createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
          contentDecisionKernel,
          previousVisibleProjectionState: null,
          prepareRetainedDisplayPublicationCandidate: () => ({
            prePublishRetainedPageMaintenance: null,
            retainedDisplayOutcome: {
              frame: retainedFrame,
              kind: "publish-exact",
            },
            retainedDisplayTransactionMs: 0,
            retainedPageMaintenanceMs: 0,
            retainedPagePreparedFrame:
              {} as RetainedContentTexturePagePreparedFrame,
          }),
        }),
      previousVisibleProjectionState: null,
      publicationLane: "content",
      retainedDisplayPublicationInput: retainedDisplayPublicationInputFixture(),
    });

    expect(result).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate: {
          blockedReasons: [
            {
              actorId: "text-control-a",
              family: "text-like-dom-control",
              reason: "text-actor-true-hole",
            },
          ],
          frozenFrameId: "cold-start-shell:browser-visual",
        },
        blockedPreparedCommittedSurfaceFrame: committedFrame,
        rendered: false,
      }),
    );
  });

  it("reports retained true-hole blockers without publishing a surface transaction", () => {
    const retainedFrame = {} as RetainedDisplayFrame;
    const committedFrame = retainedTrueHoleCommittedSurfaceFrame();
    const result = runGpuFlowRetainedCommittedSurfacePublicationContentStage<
      Record<string, never>,
      never
    >({
      contentDecisionKernel,
      deferBrowserVisualWakeup: false,
      deferResolutionUpdates: false,
      frameReasons: ["texture-upload"],
      liveProjectionSample: {
        id: 17,
        timestamp: 24,
      } as Parameters<
        typeof runGpuFlowRetainedCommittedSurfacePublicationContentStage
      >[0]["liveProjectionSample"],
      onCommittedSurfaceCandidateAccepted: () => {
        throw new Error("Blocked retained true-hole candidates must not publish.");
      },
      onRetainedDisplayCandidateAccepted: () => ({
        committedGpuNativeVisuals: undefined,
        context: {},
      }),
      prepareCommittedSurfaceFrame: () => committedFrame,
      prepareCommittedSurfacePublicationFramePlan:
        createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
          contentDecisionKernel,
        }),
      prepareRetainedDisplayPublicationFramePlan:
        createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
          contentDecisionKernel,
          previousVisibleProjectionState: null,
          prepareRetainedDisplayPublicationCandidate: () => ({
            prePublishRetainedPageMaintenance: null,
            retainedDisplayOutcome: {
              frame: retainedFrame,
              kind: "publish-exact",
            },
            retainedDisplayTransactionMs: 0,
            retainedPageMaintenanceMs: 0,
            retainedPagePreparedFrame:
              {} as RetainedContentTexturePagePreparedFrame,
          }),
        }),
      previousVisibleProjectionState: null,
      publicationLane: "content",
      retainedDisplayPublicationInput: retainedDisplayPublicationInputFixture(),
    });

    expect(result).toEqual(
      expect.objectContaining({
        blockedPreparedCommittedSurfaceFrame: committedFrame,
        blockedPreparedCommittedSurfaceFrameResourceWork:
          expect.objectContaining({
            workItems: [],
          }),
        blockedPublicationCandidate: {
          blockedReasons: [
            {
              actorId: "retained-surface-a",
              family: "retained-projection",
              reason: "retained-surface-true-hole",
            },
          ],
          frozenFrameId: "cold-start-shell:retained-projection",
        },
        rendered: false,
      }),
    );
  });
});

function retainedDisplayPublicationInputFixture({
  previousRetainedDisplayFrame = null,
}: {
  readonly previousRetainedDisplayFrame?: RetainedDisplayFrame | null;
} = {}): Parameters<GpuFlowRetainedDisplayPublicationFramePlanPreparer>[0] {
  return {
    darkMode: false,
    deferResolutionUpdates: false,
    nowMs: 24,
    preparedFrame: {} as RetainedContentTexturePagePreparedFrame,
    previousRetainedDisplayFrame,
    retainedContentPageManager:
      {} as Parameters<GpuFlowRetainedDisplayPublicationFramePlanPreparer>[0]["retainedContentPageManager"],
    retainedRuntimeFrame:
      {} as Parameters<GpuFlowRetainedDisplayPublicationFramePlanPreparer>[0]["retainedRuntimeFrame"],
  };
}

function trueHoleCommittedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [
      {
        actorFamily: "text-like-dom-control",
        actorId: "text-control-a",
        generationId: "text-generation-a",
        kind: "dom-control",
        textCoverageProof: {
          projectionCoverage: "true-hole",
        },
        visibleNonempty: true,
      },
    ],
    displayFrameId: 12,
    publishability: {
      actorFamily: "text-like-dom-control",
      actorIds: ["text-control-a"],
      blockingActorIds: ["text-control-a"],
      kind: "true-hole",
      reason: "text-actor-true-hole",
      status: "blocked",
      textActorCount: 1,
      textActorExactCoverageCount: 0,
      transactionOutcome: "publish-exact",
      visibleNonemptyTextActorCount: 1,
    },
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function retainedTrueHoleCommittedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [],
    displayFrameId: 13,
    publishability: {
      actorFamily: "retained-page",
      actorIds: ["retained-surface-a"],
      blockingActorIds: [],
      kind: "true-hole",
      reason: "retained-surface-true-hole",
      status: "blocked",
      textActorCount: 0,
      textActorExactCoverageCount: 0,
      transactionOutcome: "publish-exact",
      visibleNonemptyTextActorCount: 0,
    },
  } as unknown as GpuFlowCommittedSurfaceFrame;
}
