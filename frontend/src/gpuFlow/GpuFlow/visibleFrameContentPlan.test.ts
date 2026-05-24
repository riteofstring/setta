import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type {
  RetainedDisplayFrame,
  RetainedDisplayFrameOutcome,
} from "../retainedDisplayFrame";
import { resolveGpuFlowBlockedCommittedSurfacePublicationAbort } from "./visibleFrameAbortPolicy";
import { createGpuFlowVisiblePublicationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  runGpuFlowRetainedCommittedSurfacePublicationContentStage,
  type GpuFlowCommittedSurfacePublicationCandidateInput,
  type GpuFlowCommittedSurfacePublicationFramePlanPreparer,
  type GpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFrameContentPlan";
import { prepareGpuFlowCommittedSurfaceOverlayTexturesForPublicationCandidate } from "./visibleFrameContentPreparation";

const FLOW_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowFrame.tsx", import.meta.url),
);
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameSurfaceFrame.ts", import.meta.url),
);
const SURFACE_PUBLICATION_COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresenter.ts", import.meta.url),
);
const COORDINATOR_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameCoordinator.ts", import.meta.url),
);
const CONTENT_DECISION_KERNEL_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFrameActorAdapters/contentDecisionKernel.ts",
    import.meta.url,
  ),
);
const CONTENT_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameContentPlan.ts", import.meta.url),
);
const CONTENT_PREPARATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameContentPreparation.ts", import.meta.url),
);
const contentDecisionKernel =
  createGpuFlowVisiblePublicationContentDecisionKernel();

function readGpuFlowVisiblePublicationCoordinatorSource(): string {
  return [COORDINATOR_MODULE_PATH, CONTENT_DECISION_KERNEL_MODULE_PATH]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

describe("GPU Flow visible publication content plans", () => {
  it("keeps single-stage content publication gates off the public surfaces", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const kernelModuleSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const contentPlanReExport =
      kernelModuleSource.match(
        /export \{[\s\S]*?\} from "\.\/visibleFrameContentPlan";/,
      )?.[0] ?? "";

    expect(contentPlanReExport).toContain(
      "createGpuFlowContentPublicationFrameResult",
    );
    expect(contentPlanReExport).not.toContain(
      "runGpuFlowRetainedDisplayPublicationContentStage",
    );
    expect(contentPlanReExport).not.toContain(
      "runGpuFlowCommittedSurfacePublicationContentStage",
    );
    expect(contentPlanReExport).not.toContain(
      "prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay",
    );
    expect(contentPlanReExport).not.toContain(
      "resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toMatch(
      /\bexport function (?:create|apply|run)GpuFlow(?:RetainedDisplay|CommittedSurface)PublicationContentStage\b/,
    );
    expect(contentPlanSource).not.toContain(
      "export function prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay",
    );
    expect(contentPlanSource).not.toMatch(
      /\bexport function resolveGpuFlow(?:RetainedDisplay|CommittedSurface)PublicationFramePlanNodeLayerResult\b/,
    );
  });

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

  it("selects committed-surface publish and nonpublishable candidate plans outside flowFrame", () => {
    const committedFrame = committedSurfaceFrame();
    const preparePublishPlan =
      createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
        contentDecisionKernel,
        prepareCommittedSurfacePublicationCandidate: () => ({
          kind: "publish",
        }),
      });
    const prepareNonpublishablePlan =
      createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
        contentDecisionKernel,
        prepareCommittedSurfacePublicationCandidate: () => ({
          blockedPublicationCandidate: {
            blockedReasons: [
              {
                actorId: "actor-a",
                family: "browser-visual",
                reason: "snapshot-pending",
              },
            ],
            frozenFrameId: "cold-start-shell:browser-visual",
          },
          candidateFrame: committedFrame,
          errorMessage: null,
          kind: "nonpublishable",
          preservePreparationSnapshot: true,
          resourceWork: {
            deferWakeup: false,
            timestamp: 16,
            workItems: [],
          },
        }),
      });
    const publishPlan = preparePublishPlan(
      committedSurfacePublicationCandidateInput({
        publishedCommittedSurfaceFrame: committedFrame,
      }),
    ).framePlan;
    const nonpublishablePlan = prepareNonpublishablePlan(
      committedSurfacePublicationCandidateInput({
        publishedCommittedSurfaceFrame: committedFrame,
      }),
    ).framePlan;

    expect(publishPlan.kind).toBe("publish");
    if (publishPlan.kind !== "publish") {
      throw new Error("Expected committed-surface publish plan.");
    }
    expect(publishPlan.committedSurfacePublication.committedSurfaceFrame).toBe(
      committedFrame,
    );
    expect(nonpublishablePlan.kind).toBe("candidate");
    if (nonpublishablePlan.kind !== "candidate") {
      throw new Error(
        "Expected committed-surface nonpublishable candidate plan.",
      );
    }
    expect(nonpublishablePlan.visibleProjectionState).toBeNull();
    expect(nonpublishablePlan.blockedPublicationCandidate).toEqual(
      expect.objectContaining({
        frozenFrameId: "cold-start-shell:browser-visual",
      }),
    );
  });

  it("requires prepared committed frames for content visible projections", () => {
    expect(() =>
      contentDecisionKernel.createVisibleProjectionStateForRetainedPublication({
        frameReasons: ["manual"],
        heldPreviousProjectionState: null,
        liveProjectionSample: liveProjectionSample(),
        publicationLane: "content",
        publishedCommittedSurfaceFrame: undefined,
        retainedDisplayOutcomeKind: "publish-exact",
      }),
    ).toThrow(
      "GPU Flow visible projection requires a prepared committed surface frame.",
    );
  });

  it("keeps content publication selector factories off the coordinator public surface", () => {
    const kernelModuleSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const contentDecisionKernelSource = readFileSync(
      CONTENT_DECISION_KERNEL_MODULE_PATH,
      "utf8",
    );

    expect(kernelModuleSource).not.toMatch(
      /export \{[\s\S]*createGpuFlow(?:CommittedSurfacePublicationFramePlanSelector|RetainedDisplayPublicationFramePlanSelector|ContentPublicationBlockedCandidateSelector)[\s\S]*\} from "\.\/visibleFrameActorAdapters\/contentDecisionKernel";/,
    );
    expect(kernelModuleSource).not.toContain(
      "export { prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "createGpuFlowCommittedSurfacePublicationFramePlanSelector();",
    );
    expect(kernelModuleSource).not.toContain(
      "createGpuFlowRetainedDisplayPublicationFramePlanSelector();",
    );
    expect(kernelModuleSource).toContain(
      "createGpuFlowVisiblePublicationContentDecisionKernel",
    );
    expect(kernelModuleSource).not.toContain(
      "createGpuFlowVisiblePublicationCandidateDecisionKernel",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowVisiblePublicationContentDecisionKernel",
    );
    expect(contentPlanSource).not.toContain(
      "const visiblePublicationContentDecisionKernel",
    );
    expect(contentDecisionKernelSource).toContain(
      "export function createGpuFlowVisiblePublicationContentDecisionKernel",
    );
    expect(contentDecisionKernelSource).not.toMatch(
      /export function createGpuFlow(?:CommittedSurfacePublicationFramePlanSelector|RetainedDisplayPublicationFramePlanSelector|ContentPublicationBlockedCandidateSelector|CommittedSurfacePublicationFramePlanResultResolver|RetainedDisplayPublicationFramePlanResultResolver)/,
    );
  });

  it("keeps retained and committed publication plan selection out of flowFrame", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const coordinatorSource = readGpuFlowVisiblePublicationCoordinatorSource();
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
    expect(flowFrameSource).not.toContain("onCommittedSurfacePrepared");
    expect(flowFrameSource).not.toContain("onCommittedSurfacePublished");
    expect(flowFrameSource).not.toContain("onRetainedDisplayPublished");
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
    expect(readFileSync(COORDINATOR_MODULE_PATH, "utf8")).not.toMatch(
      /(?:apply|create)GpuFlow(?:RetainedDisplay|CommittedSurface)PublicationContentStage/,
    );
    expect(coordinatorSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(coordinatorSource).not.toContain(
      "function resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(coordinatorSource).toContain(
      "function resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(coordinatorSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(coordinatorSource).toContain(
      "function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(coordinatorSource).toContain(
      "function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(coordinatorSource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(coordinatorSource).toContain(
      "function resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
    );
    expect(coordinatorSource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
    );
    expect(coordinatorSource).toContain(
      "function selectGpuFlowCommittedSurfacePublicationFramePlan",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toContain(
      "resolveGpuFlowCommittedSurfacePublicationReadiness",
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

  it("keeps committed-surface transaction candidate selection in the coordinator", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const kernelModuleSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const coordinatorSource = readGpuFlowVisiblePublicationCoordinatorSource();

    expect(contentPlanSource).not.toContain(
      "export function prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    expect(contentPlanSource).not.toContain(
      "resolveGpuFlowCommittedSurfacePublicationReadiness",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction",
    );
    expect(coordinatorSource).toContain(
      "function prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    expect(coordinatorSource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationReadiness",
    );
    expect(coordinatorSource).not.toContain(
      "createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction",
    );
    expect(coordinatorSource).toContain('"nonpublishable"');
    expect(coordinatorSource).toContain('"blocked-candidate"');
  });

  it("keeps committed-surface frame-plan selection in the coordinator", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const coordinatorSource = readGpuFlowVisiblePublicationCoordinatorSource();

    expect(contentPlanSource).not.toContain(
      "export function selectGpuFlowCommittedSurfacePublicationFramePlan",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowNodeLayerCommittedSurfacePublicationResult",
    );
    expect(coordinatorSource).toContain(
      "function selectGpuFlowCommittedSurfacePublicationFramePlan",
    );
    expect(coordinatorSource).not.toContain(
      "export function selectGpuFlowCommittedSurfacePublicationFramePlan",
    );
    expect(coordinatorSource).toContain(
      "function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(coordinatorSource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(coordinatorSource).toContain(
      "function resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
    );
    expect(coordinatorSource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationFramePlanResult",
    );
    expect(coordinatorSource).toContain(
      "createGpuFlowNodeLayerCommittedSurfacePublicationResult",
    );
  });

  it("keeps retained-display outcome selection in the coordinator", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const coordinatorSource = readGpuFlowVisiblePublicationCoordinatorSource();

    expect(contentPlanSource).not.toContain(
      "export function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(contentPlanSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate(",
    );
    expect(coordinatorSource).toContain(
      "function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(coordinatorSource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(coordinatorSource).toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
  });

  it("keeps content blocked-candidate selection in the coordinator", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const coordinatorSource = readGpuFlowVisiblePublicationCoordinatorSource();

    expect(contentPlanSource).not.toContain(
      "export function selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidate(",
    );
    expect(coordinatorSource).toContain(
      "function selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(coordinatorSource).not.toContain(
      "export function selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(coordinatorSource).toContain(
      "function selectGpuFlowContentPublicationBlockedCandidateForFrameResult",
    );
    expect(coordinatorSource).not.toContain(
      "export function selectGpuFlowContentPublicationBlockedCandidateForFrameResult",
    );
    expect(coordinatorSource).toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidate",
    );
    expect(coordinatorSource).not.toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidateFactory",
    );
  });

  it("keeps candidate plan node-layer result conversion private to content plans", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");

    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).toContain(
      "function resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).toContain(
      "function resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult",
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
    const blockedProofHeldCandidateAbort =
      resolveGpuFlowBlockedCommittedSurfacePublicationAbort({
        blockedPreparedCommittedSurfaceFrame: null,
        blockedPreservePreparationSnapshot: false,
        committedSurfaceFrame: committedFrame,
        heldPreparedCommittedSurfaceFrame: heldPreparedFrame,
        selectedVisibleProjectionState: null,
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
    expect(blockedProofHeldCandidateAbort).toEqual({
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
        contentDecisionKernel,
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

  it("converts retained publication preparation blocks through the combined content stage", () => {
    const result = runGpuFlowRetainedCommittedSurfacePublicationContentStage<
      never,
      never
    >({
      contentDecisionKernel,
      deferBrowserVisualWakeup: false,
      deferResolutionUpdates: false,
      frameReasons: ["texture-upload"],
      liveProjectionSample: liveProjectionSample(),
      onCommittedSurfaceCandidateAccepted: () => {
        throw new Error("Blocked retained stages must not publish committed.");
      },
      onRetainedDisplayCandidateAccepted: () => {
        throw new Error("Blocked retained stages must not publish retained.");
      },
      prepareCommittedSurfaceFrame: () => {
        throw new Error("Blocked retained stages must not prepare committed.");
      },
      prepareCommittedSurfacePublicationFramePlan: () => {
        throw new Error("Blocked retained stages must not plan committed.");
      },
      prepareRetainedDisplayPublicationFramePlan:
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
        }),
      previousVisibleProjectionState: null,
      publicationLane: "content",
      retainedDisplayPublicationInput: retainedDisplayPublicationInputFixture(),
    });

    expect(result).toEqual(
      expect.objectContaining({
        blockedPublicationCandidate: expect.objectContaining({
          frozenFrameId: "cold-start-shell:retained-projection",
        }),
        rendered: false,
        retainedDisplayFollowUpFrameReason: null,
      }),
    );
  });

  it("converts committed-surface publication blocks through the combined content stage", () => {
    const candidateFrame = committedSurfaceFrame();
    const publishedRetainedFrame = { id: 11 } as RetainedDisplayFrame;
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
        contentDecisionKernel,
        prepareCommittedSurfacePublicationCandidate: () => ({
          blockedPublicationCandidate,
          candidateFrame,
          errorMessage: "blocked surface",
          kind: "nonpublishable",
          preservePreparationSnapshot: true,
          resourceWork: {
            deferWakeup: false,
            timestamp: 24,
            workItems: [],
          },
        }),
      });
    const result = runGpuFlowRetainedCommittedSurfacePublicationContentStage<
      { readonly marker: string },
      never
    >({
      contentDecisionKernel,
      deferBrowserVisualWakeup: false,
      deferResolutionUpdates: false,
      frameReasons: ["texture-upload"],
      liveProjectionSample: liveProjectionSample(),
      onCommittedSurfaceCandidateAccepted: () => {
        throw new Error("Blocked committed stages must not publish.");
      },
      onRetainedDisplayCandidateAccepted: ({
        publishedRetainedDisplayOutcomeFrame,
      }) => {
        expect(publishedRetainedDisplayOutcomeFrame.frame).toBe(
          publishedRetainedFrame,
        );
        return {
          committedGpuNativeVisuals: undefined,
          context: { marker: "retained-published" },
        };
      },
      prepareCommittedSurfaceFrame: () => candidateFrame,
      prepareCommittedSurfacePublicationFramePlan,
      prepareRetainedDisplayPublicationFramePlan:
        createPublishedRetainedDisplayPublicationFramePlan({
          publishedRetainedFrame,
        }),
      previousVisibleProjectionState: null,
      publicationLane: "content",
      retainedDisplayPublicationInput: retainedDisplayPublicationInputFixture(),
    });

    expect(result).toEqual(
      expect.objectContaining({
        blockedErrorMessage: "blocked surface",
        blockedPreparedCommittedSurfaceFrame: candidateFrame,
        blockedPreservePreparationSnapshot: true,
        blockedPublicationCandidate,
        rendered: false,
        retainedDisplayFollowUpFrameReason: "texture-upload",
      }),
    );
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
          candidate: { kind: "publish" },
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
      contentDecisionKernel,
      deferBrowserVisualWakeup: true,
      deferResolutionUpdates: false,
      frameReasons: ["texture-upload"],
      liveProjectionSample: liveProjectionSample(),
      onCommittedSurfaceCandidatePrepared: ({
        context,
        preparedCommittedSurfaceFrame: preparedFrame,
        retainedDisplayFollowUpFrameReason,
      }) => {
        calls.push("committed-prepared");
        expect(context.marker).toBe("retained-published");
        expect(preparedFrame).toBe(preparedCommittedSurfaceFrame);
        expect(retainedDisplayFollowUpFrameReason).toBe("texture-upload");
      },
      onCommittedSurfaceCandidateAccepted: ({
        committedSurfacePublication: publication,
        context,
      }) => {
        calls.push("committed-published");
        expect(context.marker).toBe("retained-published");
        expect(publication).toBe(committedSurfacePublication);
        return "published";
      },
      onRetainedDisplayCandidateAccepted: ({
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
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
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
    expect(flowFrameSource).not.toContain(
      "createGpuFlowContentPublicationFrameResultForNodeLayerFrame",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowVisibleProjectionStateForRetainedPublication",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowNodeLayerFrameVisibleProjectionStateResult",
    );
    expect(flowFrameSource).toContain(
      "createContentPublicationFrameResultForVisibleProjectionState",
    );
    expect(flowFrameSource).toContain(
      "createVisibleProjectionStateForRetainedPublication",
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
    expect(contentPlanSource).toContain(
      "function createGpuFlowContentPublicationFrameResultForVisibleProjectionState",
    );
    expect(contentPlanSource).toContain(
      "createGpuFlowNodeLayerFrameVisibleProjectionStateResult",
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

function liveProjectionSample(): GpuFlowLiveProjectionSample {
  return {
    id: 17,
    timestamp: 24,
  } as GpuFlowLiveProjectionSample;
}

function committedSurfacePublicationCandidateInput({
  publishedCommittedSurfaceFrame,
}: {
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationCandidateInput {
  return {
    committedGpuNativeVisuals: undefined,
    frameReasons: ["manual"],
    heldPreviousProjectionState: null,
    liveProjectionSample: liveProjectionSample(),
    publicationLane: "content",
    publishedCommittedSurfaceFrame,
    publishedRetainedFrame: {} as RetainedDisplayFrame,
  };
}

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

function createPublishedRetainedDisplayPublicationFramePlan({
  followUpFrameReason = "texture-upload",
  publishedRetainedFrame,
}: {
  readonly followUpFrameReason?: "texture-upload" | null | undefined;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
}): GpuFlowRetainedDisplayPublicationFramePlanPreparer {
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

  return () => ({
    followUpFrameReason,
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
  });
}

function visibleProjectionState(
  kind: GpuFlowVisibleProjectionState["transaction"]["kind"],
): GpuFlowVisibleProjectionState {
  return {
    transaction: { kind },
  } as GpuFlowVisibleProjectionState;
}
