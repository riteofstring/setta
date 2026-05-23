import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type {
  RetainedDisplayFrame,
  RetainedDisplayFrameOutcome,
} from "../retainedDisplayFrame";
import {
  prepareGpuFlowCommittedSurfaceOverlayTexturesForPublicationCandidate,
  prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay,
} from "./visibleFramePublicationContentPreparation";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  resolveGpuFlowCommittedSurfacePublicationContentResolution,
  resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult,
  resolveGpuFlowRetainedDisplayPublicationContentResolution,
  resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult,
  selectGpuFlowCommittedSurfacePublicationFramePlan,
  selectGpuFlowRetainedDisplayPublicationFramePlan,
  type GpuFlowCommittedSurfacePublicationCandidate,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationKernel";

const FLOW_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowFrame.tsx", import.meta.url),
);
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfaceFramePublication.ts", import.meta.url),
);
const CONTENT_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationContentPlan.ts", import.meta.url),
);
const CONTENT_AUTHORITY_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationContentAuthority.ts", import.meta.url),
);
const COMMITTED_SURFACE_AUTHORITY_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFramePublicationCommittedSurfaceAuthority.ts",
    import.meta.url,
  ),
);
const RETAINED_DISPLAY_AUTHORITY_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFramePublicationRetainedDisplayAuthority.ts",
    import.meta.url,
  ),
);
const CONTENT_PREPARATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationContentPreparation.ts", import.meta.url),
);

describe("GPU Flow visible publication content plans", () => {
  it("selects retained display blocked plans outside flowFrame", () => {
    const plan = selectGpuFlowRetainedDisplayPublicationFramePlan({
      previousVisibleProjectionState: null,
      retainedDisplayOutcome: {
        kind: "block-cold-first-coverage",
        reason: "coverage-missing",
      },
    });

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

  it("selects committed-surface publish and held plans outside flowFrame", () => {
    const committedFrame = committedSurfaceFrame();
    const publishPlan = selectGpuFlowCommittedSurfacePublicationFramePlan({
      candidate: {
        effect: { kind: "publish" },
        kind: "publish",
      },
      publishedCommittedSurfaceFrame: committedFrame,
    });
    const heldPlan = selectGpuFlowCommittedSurfacePublicationFramePlan({
      candidate: {
        effect: {
          candidateFrame: committedFrame,
          deferRetry: false,
          kind: "held-previous",
          timestamp: 16,
        },
        kind: "held-previous",
        visibleProjectionState: null,
      } as unknown as GpuFlowCommittedSurfacePublicationCandidate,
      publishedCommittedSurfaceFrame: committedFrame,
    });

    expect(publishPlan.kind).toBe("publish");
    if (publishPlan.kind !== "publish") {
      throw new Error("Expected committed-surface publish plan.");
    }
    expect(publishPlan.committedSurfacePublication.committedSurfaceFrame).toBe(
      committedFrame,
    );
    expect(heldPlan.kind).toBe("candidate");
    if (heldPlan.kind !== "candidate") {
      throw new Error("Expected committed-surface held candidate plan.");
    }
    expect(heldPlan.visibleProjectionState).toBeNull();
  });

  it("keeps retained and committed publication plan selection out of flowFrame", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const committedSurfaceAuthoritySource = readFileSync(
      COMMITTED_SURFACE_AUTHORITY_MODULE_PATH,
      "utf8",
    );
    const retainedDisplayAuthoritySource = readFileSync(
      RETAINED_DISPLAY_AUTHORITY_MODULE_PATH,
      "utf8",
    );
    const contentPreparationSource = readFileSync(
      CONTENT_PREPARATION_MODULE_PATH,
      "utf8",
    );

    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationFramePlanResult.blockedPublicationCandidate",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationFramePlanResult.blockedPublicationCandidate",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationFramePlanResult.visibleProjectionState",
    );
    expect(flowFrameSource).not.toContain("retainedDisplayOutcomeFrameResult");
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationActionResult",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationCandidateAction",
    );
    expect(flowFrameSource).not.toContain(
      "assertGpuFlowCommittedSurfacePublicationCandidatePublished",
    );
    expect(flowFrameSource).not.toContain(
      "selectRetainedDisplayPublicationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "selectCommittedSurfacePublicationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationFramePlan.kind",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationFramePlan.kind",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationCandidate.kind",
    );
    expect(flowFrameSource).not.toContain("publicationKind");
    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationPreparation.nodeLayerFrameResult",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationPreparation.nodeLayerFrameResult",
    );
    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationPreparation.publishedOutcomeFrame",
    );
    expect(flowFrameSource).not.toContain("framePlanResult");
    expect(flowFrameSource).not.toContain(
      "createGpuFlowContentPublicationFrameResultForRetainedDisplayPublicationPreparation",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowContentPublicationFrameResultForCommittedSurfacePublicationPreparation",
    );
    expect(flowFrameSource).not.toContain(
      "requireGpuFlowRetainedDisplayPublishedOutcomeFrame",
    );
    expect(contentPlanSource).not.toMatch(
      /export function createGpuFlowContentPublicationFrameResultForRetainedDisplayPublicationPreparation/,
    );
    expect(contentPlanSource).not.toMatch(
      /export function createGpuFlowContentPublicationFrameResultForCommittedSurfacePublicationPreparation/,
    );
    expect(contentPlanSource).not.toMatch(
      /export function requireGpuFlowRetainedDisplayPublishedOutcomeFrame/,
    );
    expect(flowFrameSource).not.toContain("onRetainedDisplayFrame?.");
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationPreparation.shouldPrepareHtmlSurfaceOverlayTextures",
    );
    expect(flowFrameSource).not.toContain(
      "function prepareHtmlSurfaceOverlayTexturesForCommittedSurfaceCandidate",
    );
    expect(flowFrameSource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationContentResolution",
    );
    expect(flowFrameSource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationContentResolution",
    );
    expect(flowFrameSource).toContain(
      "prepareRetainedDisplayPublicationFramePlan",
    );
    expect(flowFrameSource).toContain(
      "prepareCommittedSurfacePublicationFramePlan",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "selectGpuFlowCommittedSurfacePublicationFramePlan",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toContain(
      "decideGpuFlowCommittedSurfacePublicationTransaction",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction",
    );
    expect(contentPlanSource).not.toContain(
      "shouldPreservePreparedCommittedSurfaceFrameForBrowserVisualRepair",
    );
    expect(contentPlanSource).toContain("nodeLayerFrameResult:");
    expect(contentPlanSource).toContain(
      "publishedOutcomeFrame: framePlanResult.publishedOutcomeFrame",
    );
    expect(contentPreparationSource).toContain(
      "prepareCommittedSurfaceFrame?.(",
    );
    expect(contentPreparationSource).toContain(
      "shouldPrepareHtmlSurfaceOverlayTextures",
    );
  });

  it("keeps committed-surface transaction candidate selection in publication authority", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const committedSurfaceAuthoritySource = readFileSync(
      COMMITTED_SURFACE_AUTHORITY_MODULE_PATH,
      "utf8",
    );

    expect(contentPlanSource).not.toContain(
      "export function prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    expect(contentPlanSource).not.toContain(
      "decideGpuFlowCommittedSurfacePublicationTransaction",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "export function prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "decideGpuFlowCommittedSurfacePublicationTransaction",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction",
    );
  });

  it("keeps committed-surface frame-plan selection in publication authority", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const committedSurfaceAuthoritySource = readFileSync(
      COMMITTED_SURFACE_AUTHORITY_MODULE_PATH,
      "utf8",
    );

    expect(contentPlanSource).not.toContain(
      "export function selectGpuFlowCommittedSurfacePublicationFramePlan",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowNodeLayerCommittedSurfacePublicationResult",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "selectGpuFlowCommittedSurfacePublicationFramePlan",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "createGpuFlowNodeLayerCommittedSurfacePublicationResult",
    );
  });

  it("keeps retained-display outcome selection in publication authority", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const retainedDisplayAuthoritySource = readFileSync(
      RETAINED_DISPLAY_AUTHORITY_MODULE_PATH,
      "utf8",
    );

    expect(contentPlanSource).not.toContain(
      "export function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(contentPlanSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
  });

  it("keeps content blocked-candidate selection in publication authority", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const contentAuthoritySource = readFileSync(
      CONTENT_AUTHORITY_MODULE_PATH,
      "utf8",
    );

    expect(contentPlanSource).not.toContain(
      "export function selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidate",
    );
    expect(contentAuthoritySource).toContain(
      "selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(contentAuthoritySource).toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidate",
    );
  });

  it("converts retained and committed candidate plans to node-layer results outside flowFrame", () => {
    const blockedPublicationCandidate = {
      blockedReasons: [
        {
          actorId: "actor-a",
          family: "dom-control",
          reason: "snapshot-pending",
        },
      ],
      frozenFrameId: 7,
    } satisfies GpuFlowVisibleFrameBlockedPublicationCandidate;
    const retainedResult =
      resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult({
        framePlanResult: {
          blockedPublicationCandidate,
          publishedOutcomeFrame: null,
        },
      });
    const committedSurfacePublication = {
      blockedSurfacePublication: null,
      committedSurfaceFrame: null,
      committedSurfacePublicationEffect: null,
      heldPreparedCommittedSurfaceFrame: null,
    };
    const committedResult =
      resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult({
        framePlanResult: {
          blockedPublicationCandidate,
          committedSurfacePublication,
          visibleProjectionState: null,
        },
      });

    expect(retainedResult).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate,
        kind: "not-rendered",
      }),
    );
    expect(committedResult).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate,
        committedSurfacePublication,
        kind: "not-rendered",
      }),
    );
  });

  it("derives retained display follow-up frame reasons in the content plan", () => {
    const prepareRetainedDisplayPublicationFramePlan =
      createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
        previousVisibleProjectionState: null,
        prepareRetainedDisplayPublicationCandidate: () => ({
          prePublishRetainedPageMaintenance: null,
          retainedDisplayOutcome: {
            diagnostics: {},
            frame: {} as RetainedDisplayFrame,
            kind: "hold-previous",
            previousFrameId: 1,
            reason: "coverage-missing",
          } as RetainedDisplayFrameOutcome,
          retainedDisplayTransactionMs: 0,
          retainedPageMaintenanceMs: 0,
          retainedPagePreparedFrame:
            {} as RetainedContentTexturePagePreparedFrame,
        }),
      });

    expect(
      prepareRetainedDisplayPublicationFramePlan({
        deferResolutionUpdates: false,
      } as Parameters<typeof prepareRetainedDisplayPublicationFramePlan>[0])
        .followUpFrameReason,
    ).toBe("texture-upload");
    expect(
      prepareRetainedDisplayPublicationFramePlan({
        deferResolutionUpdates: true,
      } as Parameters<typeof prepareRetainedDisplayPublicationFramePlan>[0])
        .followUpFrameReason,
    ).toBeNull();
  });

  it("converts retained publication preparation results outside flowFrame", () => {
    const prepareRetainedDisplayPublicationFramePlan =
      createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
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
      {} as Parameters<typeof prepareRetainedDisplayPublicationFramePlan>[0],
    );

    const resolution =
      resolveGpuFlowRetainedDisplayPublicationContentResolution({
        deferResolutionUpdates: false,
        preparation,
        previousVisibleProjectionState: null,
      });

    expect(resolution.kind).toBe("content-frame-result");
    if (resolution.kind !== "content-frame-result") {
      throw new Error("Expected retained display candidate frame result.");
    }
    expect(resolution.frameResult).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate: expect.objectContaining({
          frozenFrameId: "cold-start-shell:retained-projection",
        }),
        rendered: false,
        retainedDisplayFollowUpFrameReason: null,
      }),
    );
  });

  it("converts committed-surface publication preparation results outside flowFrame", () => {
    const candidateFrame = committedSurfaceFrame();
    const blockedPublicationCandidate = {
      blockedReasons: [
        {
          actorId: "surface-a",
          family: "dom-control",
          reason: "snapshot-pending",
        },
      ],
      frozenFrameId: 9,
    } satisfies GpuFlowVisibleFrameBlockedPublicationCandidate;
    const prepareCommittedSurfacePublicationFramePlan =
      createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
        prepareCommittedSurfacePublicationCandidate: () => ({
          blockedPublicationCandidate,
          candidateFrame,
          effect: {
            candidateFrame,
            deferRetry: false,
            kind: "blocked",
            timestamp: 24,
          },
          errorMessage: "blocked surface",
          kind: "blocked",
          preservePreparationSnapshot: true,
        }),
      });
    const preparation = prepareCommittedSurfacePublicationFramePlan(
      {} as Parameters<typeof prepareCommittedSurfacePublicationFramePlan>[0],
    );

    const resolution =
      resolveGpuFlowCommittedSurfacePublicationContentResolution({
        deferResolutionUpdates: false,
        preparation,
        previousVisibleProjectionState: null,
        retainedDisplayFollowUpFrameReason: "texture-upload",
      });

    expect(resolution.kind).toBe("content-frame-result");
    if (resolution.kind !== "content-frame-result") {
      throw new Error("Expected committed-surface candidate frame result.");
    }
    expect(resolution.frameResult).toEqual(
      expect.objectContaining({
        blockedErrorMessage: "blocked surface",
        blockedPreparedCommittedSurfaceFrame: candidateFrame,
        blockedPreservePreparationSnapshot: true,
        blockedPublicationCandidate,
        rendered: false,
        retainedDisplayFollowUpFrameReason: "texture-upload",
      }),
    );
    expect(preparation.shouldPrepareHtmlSurfaceOverlayTextures).toBe(true);
  });

  it("prepares committed-surface frame plans from retained display outside flowFrame", () => {
    const preparedCommittedSurfaceFrame = committedSurfaceFrame();
    const publishedRetainedFrame = {
      id: 11,
    } as RetainedDisplayFrame;
    const prepared =
      prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay({
        committedGpuNativeVisuals: undefined,
        deferBrowserVisualRetry: true,
        frameReasons: ["texture-upload"],
        heldPreviousProjectionState: null,
        liveProjectionSample: {
          id: 17,
          timestamp: 24,
        } as Parameters<
          typeof prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay
        >[0]["liveProjectionSample"],
        prepareCommittedSurfaceFrame: (frame, options) => {
          expect(frame).toBe(publishedRetainedFrame);
          expect(options).toEqual({ gpuNativeVisuals: undefined });
          return preparedCommittedSurfaceFrame;
        },
        prepareCommittedSurfacePublicationFramePlan: (input) => {
          expect(input.publishedCommittedSurfaceFrame).toBe(
            preparedCommittedSurfaceFrame,
          );
          expect(input.publishedRetainedFrame).toBe(publishedRetainedFrame);
          expect(input.deferBrowserVisualRetry).toBe(true);
          return {
            candidate: { effect: { kind: "publish" }, kind: "publish" },
            committedSurfacePublication: {
              blockedSurfacePublication: null,
              committedSurfaceFrame: preparedCommittedSurfaceFrame,
              committedSurfacePublicationEffect: { kind: "publish" },
              heldPreparedCommittedSurfaceFrame: null,
            },
            framePlan: {
              blockedPublicationCandidate: null,
              committedSurfacePublication: {
                blockedSurfacePublication: null,
                committedSurfaceFrame: preparedCommittedSurfaceFrame,
                committedSurfacePublicationEffect: { kind: "publish" },
                heldPreparedCommittedSurfaceFrame: null,
              },
              kind: "publish",
              visibleProjectionState: null,
            },
            framePlanResult: {
              blockedPublicationCandidate: null,
              committedSurfacePublication: {
                blockedSurfacePublication: null,
                committedSurfaceFrame: preparedCommittedSurfaceFrame,
                committedSurfacePublicationEffect: { kind: "publish" },
                heldPreparedCommittedSurfaceFrame: null,
              },
              visibleProjectionState: null,
            },
            nodeLayerFrameResult: null,
            shouldPrepareHtmlSurfaceOverlayTextures: false,
          };
        },
        publicationLane: "content",
        publishedRetainedFrame,
      });

    expect(prepared.preparedCommittedSurfaceFrame).toBe(
      preparedCommittedSurfaceFrame,
    );
    expect(
      prepared.publicationPreparation.shouldPrepareHtmlSurfaceOverlayTextures,
    ).toBe(false);
  });

  it("gates committed-surface overlay texture preparation outside flowFrame", () => {
    const preparedInputs: number[] = [];

    prepareGpuFlowCommittedSurfaceOverlayTexturesForPublicationCandidate({
      input: 1,
      prepareOverlayTextures: (input) => preparedInputs.push(input),
      publicationPreparation: {
        shouldPrepareHtmlSurfaceOverlayTextures: false,
      },
    });
    prepareGpuFlowCommittedSurfaceOverlayTexturesForPublicationCandidate({
      input: 2,
      prepareOverlayTextures: (input) => preparedInputs.push(input),
      publicationPreparation: {
        shouldPrepareHtmlSurfaceOverlayTextures: true,
      },
    });

    expect(preparedInputs).toEqual([2]);
  });

  it("keeps content publication frame-result derivation out of the surface frame", () => {
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");

    expect(surfaceFrameSource).not.toContain(
      "function createGpuFlowVisibleContentPublicationFrameResult",
    );
    expect(surfaceFrameSource).not.toContain(
      "function createGpuFlowNotVisibleContentPublicationFrameResult",
    );
    expect(surfaceFrameSource).not.toContain(
      "createGpuFlowContentPublicationFrameResultForNodeLayerFrame",
    );
    expect(surfaceFrameSource).not.toContain(
      "onRetainedDisplayFramePublishable",
    );
    expect(surfaceFrameSource).not.toContain(
      "onRetainedDisplayFollowUpFrameNeeded",
    );
    expect(surfaceFrameSource).not.toContain("onRetainedRuntimeFrame");
    expect(contentPlanSource).toContain(
      "function createGpuFlowVisibleContentPublicationFrameResult",
    );
    expect(contentPlanSource).toContain(
      "function createGpuFlowNotVisibleContentPublicationFrameResult",
    );
  });
});

function committedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  return {
    displayFrameId: 7,
  } as GpuFlowCommittedSurfaceFrame;
}
