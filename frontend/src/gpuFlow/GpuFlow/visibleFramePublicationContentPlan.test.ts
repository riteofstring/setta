import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type {
  RetainedDisplayFrame,
  RetainedDisplayFrameOutcome,
} from "../retainedDisplayFrame";
import {
  applyGpuFlowCommittedSurfacePublicationContentStage,
  applyGpuFlowRetainedDisplayPublicationContentStage,
  createGpuFlowCommittedSurfacePublicationContentStage,
  createGpuFlowRetainedDisplayPublicationContentStage,
} from "./visibleFramePublicationContentPlan";
import { prepareGpuFlowCommittedSurfaceOverlayTexturesForPublicationCandidate } from "./visibleFramePublicationContentPreparation";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowCommittedSurfacePublicationFramePlanSelector,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationFramePlanSelector,
  prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay,
  resolveGpuFlowBlockedCommittedSurfacePublicationAbort,
  resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult,
  resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult,
  runGpuFlowCommittedSurfacePublicationContentStage,
  runGpuFlowRetainedCommittedSurfacePublicationContentStage,
  runGpuFlowRetainedDisplayPublicationContentStage,
  type GpuFlowCommittedSurfacePublicationCandidate,
  type GpuFlowCommittedSurfacePublicationFramePlanPreparer,
  type GpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationKernel";

const FLOW_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowFrame.tsx", import.meta.url),
);
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfaceFramePublication.ts", import.meta.url),
);
const SURFACE_PUBLICATION_COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfacePublicationCompletion.ts", import.meta.url),
);
const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationKernel.ts", import.meta.url),
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
    const selectRetainedDisplayPublicationFramePlan =
      createGpuFlowRetainedDisplayPublicationFramePlanSelector();
    const plan = selectRetainedDisplayPublicationFramePlan({
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
    const selectCommittedSurfacePublicationFramePlan =
      createGpuFlowCommittedSurfacePublicationFramePlanSelector();
    const committedFrame = committedSurfaceFrame();
    const publishPlan = selectCommittedSurfacePublicationFramePlan({
      candidate: {
        effect: { kind: "publish" },
        kind: "publish",
      },
      publishedCommittedSurfaceFrame: committedFrame,
    });
    const heldPlan = selectCommittedSurfacePublicationFramePlan({
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
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
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
    expect(flowFrameSource).not.toMatch(
      /\b(?:create|apply)GpuFlow(?:RetainedDisplay|CommittedSurface)PublicationContentStage\b/,
    );
    expect(flowFrameSource).not.toContain("onRetainedDisplayFrame?.");
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationPreparation.shouldPrepareHtmlSurfaceOverlayTextures",
    );
    expect(flowFrameSource).not.toContain(
      "function prepareHtmlSurfaceOverlayTexturesForCommittedSurfaceCandidate",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowRetainedDisplayPublicationContentStep",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowRetainedDisplayPublicationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "applyGpuFlowRetainedDisplayPublicationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "runGpuFlowRetainedDisplayPublicationContentStage",
    );
    expect(flowFrameSource).not.toContain("retainedDisplayContentStage.kind");
    expect(flowFrameSource).not.toContain(
      "retainedDisplayContentStage.blockedFrameResult",
    );
    expect(flowFrameSource).not.toContain(
      "retainedDisplayContentStage.publishedOutcomeFrame",
    );
    expect(flowFrameSource).not.toContain(
      "retainedDisplayContentStep.frameResult",
    );
    expect(flowFrameSource).not.toContain(
      "retainedDisplayContentStep.publishedOutcomeFrame",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowCommittedSurfacePublicationContentStep",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowCommittedSurfacePublicationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "applyGpuFlowCommittedSurfacePublicationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "runGpuFlowCommittedSurfacePublicationContentStage",
    );
    expect(flowFrameSource).not.toContain("committedSurfaceContentStage.kind");
    expect(flowFrameSource).not.toContain(
      "committedSurfaceContentStage.blockedFrameResult",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfaceContentStage.committedSurfacePublication",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfaceContentStep.frameResult",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfaceContentStep.committedSurfacePublication",
    );
    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationContentResolution",
    );
    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowCommittedSurfacePublicationContentResolution",
    );
    expect(flowFrameSource).not.toContain("content-frame-result");
    expect(flowFrameSource).not.toContain("published-outcome-frame");
    expect(flowFrameSource).not.toContain("committed-surface-publication");
    expect(flowFrameSource).toContain(
      "runRetainedCommittedSurfacePublicationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "prepareRetainedDisplayPublicationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "prepareCommittedSurfacePublicationFramePlan",
    );
    expect(surfaceFrameSource).toContain(
      "runRetainedCommittedSurfacePublicationContentStage",
    );
    expect(surfaceFrameSource).not.toContain(
      "prepareRetainedDisplayPublicationFramePlan",
    );
    expect(surfaceFrameSource).not.toContain(
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
    expect(readFileSync(KERNEL_MODULE_PATH, "utf8")).not.toMatch(
      /(?:apply|create)GpuFlow(?:RetainedDisplay|CommittedSurface)PublicationContentStage/,
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "function resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(retainedDisplayAuthoritySource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "function resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(retainedDisplayAuthoritySource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(retainedDisplayAuthoritySource).not.toContain(
      "export function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(committedSurfaceAuthoritySource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "function resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
    );
    expect(committedSurfaceAuthoritySource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "function selectGpuFlowCommittedSurfacePublicationFramePlan",
    );
    expect(committedSurfaceAuthoritySource).not.toContain(
      "export function selectGpuFlowCommittedSurfacePublicationFramePlan",
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
    expect(contentPlanSource).toContain("prepareCommittedSurfaceFrame?.(");
    expect(contentPreparationSource).not.toContain(
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
    expect(committedSurfaceAuthoritySource).not.toContain(
      "export function decideGpuFlowCommittedSurfacePublicationTransaction",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction",
    );
    expect(committedSurfaceAuthoritySource).not.toContain(
      "export function createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction",
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
      "function selectGpuFlowCommittedSurfacePublicationFramePlan",
    );
    expect(committedSurfaceAuthoritySource).not.toContain(
      "export function selectGpuFlowCommittedSurfacePublicationFramePlan",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(committedSurfaceAuthoritySource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(committedSurfaceAuthoritySource).toContain(
      "function resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
    );
    expect(committedSurfaceAuthoritySource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
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
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate(",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(retainedDisplayAuthoritySource).not.toContain(
      "export function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(retainedDisplayAuthoritySource).toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidateFactory",
    );
    expect(retainedDisplayAuthoritySource).not.toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate({",
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
      "createGpuFlowBrowserVisualBlockedPublicationCandidate(",
    );
    expect(contentAuthoritySource).toContain(
      "function selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(contentAuthoritySource).not.toContain(
      "export function selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(contentAuthoritySource).toContain(
      "function selectGpuFlowContentPublicationBlockedCandidateForFrameResult",
    );
    expect(contentAuthoritySource).not.toContain(
      "export function selectGpuFlowContentPublicationBlockedCandidateForFrameResult",
    );
    expect(contentAuthoritySource).toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidateFactory",
    );
    expect(contentAuthoritySource).not.toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidate({",
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

  it("resolves blocked committed-surface abort instructions outside completion", () => {
    const blockedPreparedFrame = committedSurfaceFrame(8);
    const heldPreparedFrame = committedSurfaceFrame(9);
    const committedFrame = committedSurfaceFrame(10);
    const explicitBlockedAbort =
      resolveGpuFlowBlockedCommittedSurfacePublicationAbort({
        blockedPreparedCommittedSurfaceFrame: blockedPreparedFrame,
        blockedPreservePreparationSnapshot: true,
        committedSurfaceFrame: committedFrame,
        heldPreparedCommittedSurfaceFrame: heldPreparedFrame,
        selectedVisibleProjectionState: visibleProjectionState(
          "content-publication",
        ),
      });
    const heldPreviousBlockedAbort =
      resolveGpuFlowBlockedCommittedSurfacePublicationAbort({
        blockedPreparedCommittedSurfaceFrame: null,
        blockedPreservePreparationSnapshot: false,
        committedSurfaceFrame: committedFrame,
        heldPreparedCommittedSurfaceFrame: heldPreparedFrame,
        selectedVisibleProjectionState: visibleProjectionState("held-previous"),
      });
    const completionSource = readFileSync(
      SURFACE_PUBLICATION_COMPLETION_MODULE_PATH,
      "utf8",
    );

    expect(explicitBlockedAbort).toEqual({
      frame: blockedPreparedFrame,
      preservePreparationSnapshot: true,
    });
    expect(heldPreviousBlockedAbort).toEqual({
      frame: heldPreparedFrame,
      preservePreparationSnapshot: true,
    });
    expect(completionSource).not.toContain(
      "function resolveGpuFlowBlockedPreparedCommittedSurfaceFrame",
    );
    expect(completionSource).not.toContain(
      "function resolveGpuFlowBlockedPreparedCommittedSurfaceFramePreservation",
    );
    expect(completionSource).toContain(
      "resolveGpuFlowBlockedCommittedSurfacePublicationAbort",
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

    const contentStage = createGpuFlowRetainedDisplayPublicationContentStage({
      deferResolutionUpdates: false,
      preparation,
      previousVisibleProjectionState: null,
    });

    expect(contentStage.kind).toBe("blocked");
    if (contentStage.kind !== "blocked") {
      throw new Error("Expected retained display candidate frame result.");
    }
    expect(contentStage.blockedFrameResult).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate: expect.objectContaining({
          frozenFrameId: "cold-start-shell:retained-projection",
        }),
        rendered: false,
        retainedDisplayFollowUpFrameReason: null,
      }),
    );
    expect(
      applyGpuFlowRetainedDisplayPublicationContentStage({
        contentStage,
        onPublished: () => {
          throw new Error("Blocked stages must not publish.");
        },
      }),
    ).toBe(contentStage.blockedFrameResult);
    expect(
      runGpuFlowRetainedDisplayPublicationContentStage({
        deferResolutionUpdates: false,
        onPublished: () => {
          throw new Error("Blocked stages must not publish.");
        },
        preparation,
        previousVisibleProjectionState: null,
      }),
    ).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate: expect.objectContaining({
          frozenFrameId: "cold-start-shell:retained-projection",
        }),
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

    const contentStage = createGpuFlowCommittedSurfacePublicationContentStage({
      deferResolutionUpdates: false,
      preparation,
      previousVisibleProjectionState: null,
      retainedDisplayFollowUpFrameReason: "texture-upload",
    });

    expect(contentStage.kind).toBe("blocked");
    if (contentStage.kind !== "blocked") {
      throw new Error("Expected committed-surface candidate frame result.");
    }
    expect(contentStage.blockedFrameResult).toEqual(
      expect.objectContaining({
        blockedErrorMessage: "blocked surface",
        blockedPreparedCommittedSurfaceFrame: candidateFrame,
        blockedPreservePreparationSnapshot: true,
        blockedPublicationCandidate,
        rendered: false,
        retainedDisplayFollowUpFrameReason: "texture-upload",
      }),
    );
    expect(
      applyGpuFlowCommittedSurfacePublicationContentStage({
        contentStage,
        onPublished: () => {
          throw new Error("Blocked stages must not publish.");
        },
      }),
    ).toBe(contentStage.blockedFrameResult);
    expect(
      runGpuFlowCommittedSurfacePublicationContentStage({
        deferResolutionUpdates: false,
        onPublished: () => {
          throw new Error("Blocked stages must not publish.");
        },
        preparation,
        previousVisibleProjectionState: null,
        retainedDisplayFollowUpFrameReason: "texture-upload",
      }),
    ).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate,
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

  it("runs retained and committed publication content stages outside flowFrame", () => {
    const calls: string[] = [];
    const previousRetainedFrame = { id: 10 } as RetainedDisplayFrame;
    const publishedRetainedFrame = { id: 11 } as RetainedDisplayFrame;
    const preparedCommittedSurfaceFrame = committedSurfaceFrame(12);
    const publishedOutcomeFrame = {
      frame: publishedRetainedFrame,
      kind: "published",
      outcome: {
        frame: publishedRetainedFrame,
        kind: "publish-exact",
      },
      outcomeKind: "publish-exact",
    } as const;
    const retainedDisplayPublication = {
      prePublishRetainedPageMaintenance: null,
      retainedDisplayOutcome: publishedOutcomeFrame.outcome,
      retainedDisplayTransactionMs: 1,
      retainedPageMaintenanceMs: 2,
      retainedPagePreparedFrame: {} as RetainedContentTexturePagePreparedFrame,
    } as ReturnType<GpuFlowRetainedDisplayPublicationFramePlanPreparer>["publication"];
    const committedSurfacePublication = {
      blockedSurfacePublication: null,
      committedSurfaceFrame: preparedCommittedSurfaceFrame,
      committedSurfacePublicationEffect: { kind: "publish" },
      heldPreparedCommittedSurfaceFrame: null,
    } as const;
    const prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer =
      (input) => {
        calls.push("retained-plan");
        expect(input.previousRetainedDisplayFrame).toBe(previousRetainedFrame);
        return {
          followUpFrameReason: "texture-upload",
          framePlan: {
            kind: "published",
            publishedOutcomeFrame,
          },
          framePlanResult: {
            blockedPublicationCandidate: null,
            publishedOutcomeFrame,
          },
          nodeLayerFrameResult: null,
          publication: retainedDisplayPublication,
          publishedOutcomeFrame,
        };
      };
    const prepareCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanPreparer =
      (input) => {
        calls.push("committed-plan");
        expect(input.publishedCommittedSurfaceFrame).toBe(
          preparedCommittedSurfaceFrame,
        );
        expect(input.publishedRetainedFrame).toBe(publishedRetainedFrame);
        return {
          candidate: { effect: { kind: "publish" }, kind: "publish" },
          committedSurfacePublication,
          framePlan: {
            blockedPublicationCandidate: null,
            committedSurfacePublication,
            kind: "publish",
            visibleProjectionState: null,
          },
          framePlanResult: {
            blockedPublicationCandidate: null,
            committedSurfacePublication,
            visibleProjectionState: null,
          },
          nodeLayerFrameResult: null,
          shouldPrepareHtmlSurfaceOverlayTextures: false,
        };
      };
    const result = runGpuFlowRetainedCommittedSurfacePublicationContentStage<
      { readonly marker: string },
      string
    >({
      deferBrowserVisualRetry: true,
      deferResolutionUpdates: false,
      frameReasons: ["texture-upload"],
      liveProjectionSample: {
        id: 17,
        timestamp: 24,
      } as Parameters<
        typeof prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay
      >[0]["liveProjectionSample"],
      onCommittedSurfacePrepared: ({
        context,
        preparedCommittedSurfaceFrame: preparedFrame,
        retainedDisplayFollowUpFrameReason,
      }) => {
        calls.push("committed-prepared");
        expect(context.marker).toBe("retained-published");
        expect(preparedFrame).toBe(preparedCommittedSurfaceFrame);
        expect(retainedDisplayFollowUpFrameReason).toBe("texture-upload");
      },
      onCommittedSurfacePublished: ({
        committedSurfacePublication: publication,
        context,
      }) => {
        calls.push("committed-published");
        expect(context.marker).toBe("retained-published");
        expect(publication).toBe(committedSurfacePublication);
        return "published";
      },
      onRetainedDisplayPublished: ({
        publishedRetainedDisplayOutcomeFrame,
        retainedDisplayPublication: publication,
      }) => {
        calls.push("retained-published");
        expect(publishedRetainedDisplayOutcomeFrame).toBe(
          publishedOutcomeFrame,
        );
        expect(publication).toBe(retainedDisplayPublication);
        return {
          committedGpuNativeVisuals: undefined,
          context: { marker: "retained-published" },
        };
      },
      prepareCommittedSurfaceFrame: (frame, options) => {
        calls.push("committed-frame");
        expect(frame).toBe(publishedRetainedFrame);
        expect(options).toEqual({ gpuNativeVisuals: undefined });
        return preparedCommittedSurfaceFrame;
      },
      prepareCommittedSurfacePublicationFramePlan,
      prepareRetainedDisplayPublicationFramePlan,
      previousVisibleProjectionState: null,
      publicationLane: "content",
      retainedDisplayPublicationInput: {
        darkMode: false,
        deferResolutionUpdates: false,
        nowMs: 24,
        preparedFrame: {} as RetainedContentTexturePagePreparedFrame,
        previousRetainedDisplayFrame: previousRetainedFrame,
        retainedContentPageManager:
          {} as Parameters<GpuFlowRetainedDisplayPublicationFramePlanPreparer>[0]["retainedContentPageManager"],
        retainedRuntimeFrame:
          {} as Parameters<GpuFlowRetainedDisplayPublicationFramePlanPreparer>[0]["retainedRuntimeFrame"],
      },
    });

    expect(result).toBe("published");
    expect(calls).toEqual([
      "retained-plan",
      "retained-published",
      "committed-frame",
      "committed-plan",
      "committed-prepared",
      "committed-published",
    ]);
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

function committedSurfaceFrame(
  displayFrameId = 7,
): GpuFlowCommittedSurfaceFrame {
  return {
    displayFrameId,
  } as GpuFlowCommittedSurfaceFrame;
}

function visibleProjectionState(
  kind: GpuFlowVisibleProjectionState["transaction"]["kind"],
): GpuFlowVisibleProjectionState {
  return {
    transaction: { kind },
  } as GpuFlowVisibleProjectionState;
}
