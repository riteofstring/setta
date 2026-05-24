import { describe, expect, it } from "vitest";

import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type {
  RetainedDisplayFrame,
  RetainedDisplayFrameOutcome,
} from "../retainedDisplayFrame";
import { createGpuFlowVisiblePublicationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowRetainedDisplayPublicationFramePlanPreparer,
} from "./visibleFrameContentPlan";

const contentDecisionKernel =
  createGpuFlowVisiblePublicationContentDecisionKernel();

describe("GPU Flow retained display blocked content plans", () => {
  it("selects retained display blocked plans outside flowFrame", () => {
    const prepareRetainedDisplayPublicationFramePlan =
      createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
        contentDecisionKernel,
        previousVisibleProjectionState: null,
        prepareRetainedDisplayPublicationCandidate: () => ({
          prePublishRetainedPageMaintenance: null,
          retainedDisplayOutcome: {
            kind: "block-cold-first-coverage",
            reason: "coverage-missing",
          } as RetainedDisplayFrameOutcome,
          retainedDisplayTransactionMs: 0,
          retainedPageMaintenanceMs: 0,
          retainedPagePreparedFrame:
            {} as RetainedContentTexturePagePreparedFrame,
        }),
      });
    const preparation = prepareRetainedDisplayPublicationFramePlan(
      retainedDisplayPublicationInputFixture(),
    );
    const plan = preparation.framePlan;

    expect(preparation.framePlanResult.publishedOutcomeFrame).toBeNull();
    expect(preparation.nodeLayerFrameResult).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate: expect.objectContaining({
          frozenFrameId: "cold-start-shell:retained-projection",
        }),
      }),
    );
    expect(plan.kind).toBe("blocked");
    if (plan.kind !== "blocked") {
      throw new Error("Expected retained display blocked plan.");
    }
    expect(plan.blockedPublicationCandidate).toEqual({
      blockedReasons: [
        {
          actorId: null,
          family: "retained-projection",
          reason: "coverage-missing",
        },
      ],
      frozenFrameId: "cold-start-shell:retained-projection",
    });
  });

  it("blocks retained cold placeholders after a visible frame exists", () => {
    const prepareRetainedDisplayPublicationFramePlan =
      createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
        contentDecisionKernel,
        previousVisibleProjectionState: visibleProjectionState(
          "content-publication",
        ),
        prepareRetainedDisplayPublicationCandidate: () => ({
          prePublishRetainedPageMaintenance: null,
          retainedDisplayOutcome: {
            frame: {} as RetainedDisplayFrame,
            kind: "publish-cold-placeholder",
            reason: "coverage-missing",
          } as RetainedDisplayFrameOutcome,
          retainedDisplayTransactionMs: 0,
          retainedPageMaintenanceMs: 0,
          retainedPagePreparedFrame:
            {} as RetainedContentTexturePagePreparedFrame,
        }),
      });
    const preparation = prepareRetainedDisplayPublicationFramePlan(
      retainedDisplayPublicationInputFixture(),
    );

    expect(preparation.framePlan.kind).toBe("blocked");
    expect(preparation.framePlanResult.publishedOutcomeFrame).toBeNull();
    expect(preparation.nodeLayerFrameResult).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate: expect.objectContaining({
          blockedReasons: [
            {
              actorId: null,
              family: "retained-projection",
              reason: "coverage-missing",
            },
          ],
          frozenFrameId: 12,
        }),
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

function visibleProjectionState(
  kind: GpuFlowVisibleProjectionState["transaction"]["kind"],
): GpuFlowVisibleProjectionState {
  return {
    committedFrame: {
      displayFrameId: 12,
    },
    transaction: { kind },
  } as GpuFlowVisibleProjectionState;
}
