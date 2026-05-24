import { describe, expect, it } from "vitest";

import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisibleFramePresentationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowPreparedContentFramePresentationFramePlanPreparer,
  createGpuFlowRetainedDisplayPresentationFramePlanPreparer,
  runGpuFlowRetainedPreparedContentFramePresentationContentStage,
  type GpuFlowRetainedDisplayPresentationFramePlanPreparer,
} from "./visibleFrameContentPlan";

const contentDecisionKernel =
  createGpuFlowVisibleFramePresentationContentDecisionKernel();

describe("GPU Flow retained display candidate content plans", () => {
  it("presents retained display candidates instead of retained projection blockers", () => {
    const retainedFrame = {} as RetainedDisplayFrame;
    const prepareRetainedDisplayPresentationFramePlan =
      createGpuFlowRetainedDisplayPresentationFramePlanPreparer({
        contentDecisionKernel,
        previousVisibleProjectionState: null,
        prepareRetainedDisplayPresentationCandidate: () => ({
          prePresentRetainedPageMaintenance: null,
          retainedDisplayOutcome: {
            frame: retainedFrame,
            kind: "present-exact",
          },
          retainedDisplayTransactionMs: 0,
          retainedPageMaintenanceMs: 0,
          retainedPagePreparedFrame:
            {} as RetainedContentTexturePagePreparedFrame,
        }),
      });
    const preparation = prepareRetainedDisplayPresentationFramePlan(
      retainedDisplayPresentationInputFixture(),
    );

    expect(preparation.framePlan.kind).toBe("presented");
    expect(preparation.framePlanResult.blockedPresentationCandidate).toBeNull();
    expect(preparation.nodeLayerFrameResult).toBeNull();
    expect(preparation.presentedOutcomeFrame.frame).toBe(retainedFrame);
  });

  it("reports visible true-hole blockers from prepared content frame candidates", () => {
    const retainedFrame = {} as RetainedDisplayFrame;
    const preparedContentFrame = trueHolePreparedContentFrame();
    const result =
      runGpuFlowRetainedPreparedContentFramePresentationContentStage<
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
          typeof runGpuFlowRetainedPreparedContentFramePresentationContentStage
        >[0]["liveProjectionSample"],
        onPreparedContentFrameCandidateAccepted: () => {
          throw new Error("Blocked committed candidates must not present.");
        },
        onRetainedDisplayCandidateAccepted: () => ({
          committedGpuNativeVisuals: undefined,
          context: {},
        }),
        prepareContentFrame: () => preparedContentFrame,
        preparePreparedContentFramePresentationFramePlan:
          createGpuFlowPreparedContentFramePresentationFramePlanPreparer({
            contentDecisionKernel,
          }),
        prepareRetainedDisplayPresentationFramePlan:
          createGpuFlowRetainedDisplayPresentationFramePlanPreparer({
            contentDecisionKernel,
            previousVisibleProjectionState: null,
            prepareRetainedDisplayPresentationCandidate: () => ({
              prePresentRetainedPageMaintenance: null,
              retainedDisplayOutcome: {
                frame: retainedFrame,
                kind: "present-exact",
              },
              retainedDisplayTransactionMs: 0,
              retainedPageMaintenanceMs: 0,
              retainedPagePreparedFrame:
                {} as RetainedContentTexturePagePreparedFrame,
            }),
          }),
        previousVisibleProjectionState: null,
        contentWorkLane: "content",
        retainedDisplayPresentationInput:
          retainedDisplayPresentationInputFixture(),
      });

    expect(result).toEqual(
      expect.objectContaining({
        blockedPresentationCandidate: {
          blockedReasons: [
            {
              actorId: "text-control-a",
              family: "text-like-dom-control",
              reason: "text-actor-true-hole",
            },
          ],
          frozenFrameId: "cold-start-shell:browser-visual",
        },
        blockedPreparedContentFrame: preparedContentFrame,
        rendered: false,
      }),
    );
  });

  it("reports retained true-hole blockers without presenting a surface transaction", () => {
    const retainedFrame = {} as RetainedDisplayFrame;
    const preparedContentFrame = retainedTrueHolePreparedContentFrame();
    const result =
      runGpuFlowRetainedPreparedContentFramePresentationContentStage<
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
          typeof runGpuFlowRetainedPreparedContentFramePresentationContentStage
        >[0]["liveProjectionSample"],
        onPreparedContentFrameCandidateAccepted: () => {
          throw new Error(
            "Blocked retained true-hole candidates must not present.",
          );
        },
        onRetainedDisplayCandidateAccepted: () => ({
          committedGpuNativeVisuals: undefined,
          context: {},
        }),
        prepareContentFrame: () => preparedContentFrame,
        preparePreparedContentFramePresentationFramePlan:
          createGpuFlowPreparedContentFramePresentationFramePlanPreparer({
            contentDecisionKernel,
          }),
        prepareRetainedDisplayPresentationFramePlan:
          createGpuFlowRetainedDisplayPresentationFramePlanPreparer({
            contentDecisionKernel,
            previousVisibleProjectionState: null,
            prepareRetainedDisplayPresentationCandidate: () => ({
              prePresentRetainedPageMaintenance: null,
              retainedDisplayOutcome: {
                frame: retainedFrame,
                kind: "present-exact",
              },
              retainedDisplayTransactionMs: 0,
              retainedPageMaintenanceMs: 0,
              retainedPagePreparedFrame:
                {} as RetainedContentTexturePagePreparedFrame,
            }),
          }),
        previousVisibleProjectionState: null,
        contentWorkLane: "content",
        retainedDisplayPresentationInput:
          retainedDisplayPresentationInputFixture(),
      });

    expect(result).toEqual(
      expect.objectContaining({
        blockedPreparedContentFrame: preparedContentFrame,
        blockedPreparedContentFrameResourceWork: expect.objectContaining({
          workItems: [],
        }),
        blockedPresentationCandidate: {
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

function retainedDisplayPresentationInputFixture({
  previousRetainedDisplayFrame = null,
}: {
  readonly previousRetainedDisplayFrame?: RetainedDisplayFrame | null;
} = {}): Parameters<GpuFlowRetainedDisplayPresentationFramePlanPreparer>[0] {
  return {
    darkMode: false,
    deferResolutionUpdates: false,
    nowMs: 24,
    preparedFrame: {} as RetainedContentTexturePagePreparedFrame,
    previousRetainedDisplayFrame,
    retainedContentPageManager:
      {} as Parameters<GpuFlowRetainedDisplayPresentationFramePlanPreparer>[0]["retainedContentPageManager"],
    retainedRuntimeFrame:
      {} as Parameters<GpuFlowRetainedDisplayPresentationFramePlanPreparer>[0]["retainedRuntimeFrame"],
  };
}

function trueHolePreparedContentFrame(): GpuFlowPreparedContentFrame {
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
      transactionOutcome: "present-exact",
      visibleNonemptyTextActorCount: 1,
    },
  } as unknown as GpuFlowPreparedContentFrame;
}

function retainedTrueHolePreparedContentFrame(): GpuFlowPreparedContentFrame {
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
      transactionOutcome: "present-exact",
      visibleNonemptyTextActorCount: 0,
    },
  } as unknown as GpuFlowPreparedContentFrame;
}
