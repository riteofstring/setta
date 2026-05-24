import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedContentTexturePagePreparedFrame } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { resolveGpuFlowBlockedPreparedContentFramePublicationAbort } from "./visibleFrameAbortPolicy";
import { createGpuFlowVisibleFramePresentationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowPreparedContentFramePublicationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  runGpuFlowRetainedPreparedContentFramePublicationContentStage,
  type GpuFlowPreparedContentFramePublicationCandidateInput,
  type GpuFlowPreparedContentFramePublicationFramePlanPreparer,
  type GpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFrameContentPlan";
import { prepareGpuFlowPreparedContentFrameOverlayTexturesForPublicationCandidate } from "./visibleFrameContentPreparation";

const FLOW_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowFrame.tsx", import.meta.url),
);
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameSurfaceFrame.ts", import.meta.url),
);
const SURFACE_PUBLICATION_COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresentation.ts", import.meta.url),
);
const COORDINATOR_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameCoordinator.ts", import.meta.url),
);
const STATE_MACHINE_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameStateMachine.ts", import.meta.url),
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
  createGpuFlowVisibleFramePresentationContentDecisionKernel();

function readGpuFlowVisibleFramePresentationCoordinatorSource(): string {
  return [
    COORDINATOR_MODULE_PATH,
    CONTENT_DECISION_KERNEL_MODULE_PATH,
    STATE_MACHINE_MODULE_PATH,
  ]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

describe("GPU Flow visible frame presentation content plans", () => {
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
      "runGpuFlowPreparedContentFramePublicationContentStage",
    );
    expect(contentPlanReExport).not.toContain(
      "prepareGpuFlowPreparedContentFramePublicationFramePlanForRetainedDisplay",
    );
    expect(contentPlanReExport).not.toContain(
      "resolveGpuFlowPreparedContentFramePublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toMatch(
      /\bexport function (?:create|apply|run)GpuFlow(?:RetainedDisplay|PreparedContent)PublicationContentStage\b/,
    );
    expect(contentPlanSource).not.toContain(
      "export function prepareGpuFlowPreparedContentFramePublicationFramePlanForRetainedDisplay",
    );
    expect(contentPlanSource).not.toMatch(
      /\bexport function resolveGpuFlow(?:RetainedDisplay|PreparedContent)PublicationFramePlanNodeLayerResult\b/,
    );
  });

  it("selects prepared-content-frame publish and nonpublishable candidate plans outside flowFrame", () => {
    const preparedContentFrame = createPreparedContentFrame();
    const preparePublishPlan =
      createGpuFlowPreparedContentFramePublicationFramePlanPreparer({
        contentDecisionKernel,
        preparePreparedContentFramePublicationCandidate: () => ({
          kind: "publish",
        }),
      });
    const prepareNonpublishablePlan =
      createGpuFlowPreparedContentFramePublicationFramePlanPreparer({
        contentDecisionKernel,
        preparePreparedContentFramePublicationCandidate: () => ({
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
          candidateFrame: preparedContentFrame,
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
      preparedContentFramePublicationCandidateInput({
        preparedContentFrame: preparedContentFrame,
      }),
    ).framePlan;
    const nonpublishablePlan = prepareNonpublishablePlan(
      preparedContentFramePublicationCandidateInput({
        preparedContentFrame: preparedContentFrame,
      }),
    ).framePlan;

    expect(publishPlan.kind).toBe("publish");
    if (publishPlan.kind !== "publish") {
      throw new Error("Expected prepared-content-frame publish plan.");
    }
    expect(
      publishPlan.preparedContentFramePublication.preparedContentFrame,
    ).toBe(preparedContentFrame);
    expect(nonpublishablePlan.kind).toBe("candidate");
    if (nonpublishablePlan.kind !== "candidate") {
      throw new Error(
        "Expected prepared-content-frame nonpublishable candidate plan.",
      );
    }
    expect(nonpublishablePlan.visibleProjectionState).toBeNull();
    expect(nonpublishablePlan.blockedPublicationCandidate).toEqual(
      expect.objectContaining({
        frozenFrameId: "cold-start-shell:browser-visual",
      }),
    );
  });

  it("requires prepared prepared content frames for content visible projections", () => {
    expect(() =>
      contentDecisionKernel.createVisibleProjectionStateForRetainedPublication({
        frameReasons: ["manual"],
        liveProjectionSample: liveProjectionSample(),
        contentWorkLane: "content",
        preparedContentFrame: undefined,
      }),
    ).toThrow("GPU Flow visible projection requires a prepared content frame.");
  });

  it("creates content-publication visible projection state for retained candidates", () => {
    const publication =
      contentDecisionKernel.createVisibleProjectionStateForRetainedPublication({
        frameReasons: ["texture-upload", "dom-control-activation"],
        liveProjectionSample: liveProjectionSample(),
        contentWorkLane: "content",
        preparedContentFrame: createPreparedContentFrame(48),
      });

    expect(publication.transaction.kind).toBe("content-publication");
    expect(publication.preparedContentFrame.displayFrameId).toBe(48);
  });

  it("keeps content publication selector factories off the coordinator public surface", () => {
    const kernelModuleSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const contentDecisionKernelSource = readFileSync(
      CONTENT_DECISION_KERNEL_MODULE_PATH,
      "utf8",
    );

    expect(kernelModuleSource).not.toMatch(
      /export \{[\s\S]*createGpuFlow(?:PreparedContentFramePublicationFramePlanSelector|RetainedDisplayPublicationFramePlanSelector|ContentPublicationBlockedCandidateSelector)[\s\S]*\} from "\.\/visibleFrameActorAdapters\/contentDecisionKernel";/,
    );
    expect(kernelModuleSource).not.toContain(
      "export { prepareGpuFlowPreparedContentFramePublicationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "createGpuFlowPreparedContentFramePublicationFramePlanSelector();",
    );
    expect(kernelModuleSource).not.toContain(
      "createGpuFlowRetainedDisplayPublicationFramePlanSelector();",
    );
    expect(kernelModuleSource).toContain(
      "createGpuFlowVisibleFramePresentationContentDecisionKernel",
    );
    expect(kernelModuleSource).not.toContain(
      "createGpuFlowVisibleFramePresentationCandidateDecisionKernel",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowVisibleFramePresentationContentDecisionKernel",
    );
    expect(contentPlanSource).not.toContain(
      "const visibleFramePresentationContentDecisionKernel",
    );
    expect(contentDecisionKernelSource).toContain(
      "export function createGpuFlowVisibleFramePresentationContentDecisionKernel",
    );
    expect(contentDecisionKernelSource).not.toMatch(
      /export function createGpuFlow(?:PreparedContentFramePublicationFramePlanSelector|RetainedDisplayPublicationFramePlanSelector|ContentPublicationBlockedCandidateSelector|PreparedContentFramePublicationFramePlanResultResolver|RetainedDisplayPublicationFramePlanResultResolver)/,
    );
  });

  it("keeps retained and committed publication plan selection out of flowFrame", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const coordinatorSource =
      readGpuFlowVisibleFramePresentationCoordinatorSource();
    const stateMachineSource = readFileSync(STATE_MACHINE_MODULE_PATH, "utf8");
    const contentDecisionKernelSource = readFileSync(
      CONTENT_DECISION_KERNEL_MODULE_PATH,
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
      "preparedContentFramePublicationFramePlanResult.blockedPublicationCandidate",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePublicationFramePlanResult.visibleProjectionState",
    );
    expect(flowFrameSource).not.toContain("retainedDisplayOutcomeFrameResult");
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePublicationActionResult",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePublicationCandidateAction",
    );
    expect(flowFrameSource).not.toContain(
      "assertGpuFlowPreparedContentFramePublicationCandidatePublished",
    );
    expect(flowFrameSource).not.toContain(
      "selectRetainedDisplayPublicationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "selectPreparedContentFramePublicationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationFramePlan.kind",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePublicationFramePlan.kind",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePublicationCandidate.kind",
    );
    expect(flowFrameSource).not.toContain("publicationKind");
    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationPreparation.nodeLayerFrameResult",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePublicationPreparation.nodeLayerFrameResult",
    );
    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationPreparation.publishedOutcomeFrame",
    );
    expect(flowFrameSource).not.toContain("framePlanResult");
    expect(flowFrameSource).not.toContain(
      "createGpuFlowContentPublicationFrameResultForRetainedDisplayPublicationPreparation",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowContentPublicationFrameResultForPreparedContentFramePublicationPreparation",
    );
    expect(flowFrameSource).not.toContain(
      "requireGpuFlowRetainedDisplayPublishedOutcomeFrame",
    );
    expect(contentPlanSource).not.toMatch(
      /export function createGpuFlowContentPublicationFrameResultForRetainedDisplayPublicationPreparation/,
    );
    expect(contentPlanSource).not.toMatch(
      /export function createGpuFlowContentPublicationFrameResultForPreparedContentFramePublicationPreparation/,
    );
    expect(contentPlanSource).not.toMatch(
      /export function requireGpuFlowRetainedDisplayPublishedOutcomeFrame/,
    );
    expect(flowFrameSource).not.toMatch(
      /\b(?:create|apply)GpuFlow(?:RetainedDisplay|PreparedContent)PublicationContentStage\b/,
    );
    expect(flowFrameSource).not.toContain("onRetainedDisplayFrame?.");
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePublicationPreparation.shouldPrepareHtmlSurfaceOverlayTextures",
    );
    expect(flowFrameSource).not.toContain(
      "function prepareHtmlSurfaceOverlayTexturesForPreparedContentFrameCandidate",
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
      "createGpuFlowPreparedContentFramePublicationContentStep",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowPreparedContentFramePublicationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "applyGpuFlowPreparedContentFramePublicationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "runGpuFlowPreparedContentFramePublicationContentStage",
    );
    expect(flowFrameSource).not.toContain("preparedContentContentStage.kind");
    expect(flowFrameSource).not.toContain(
      "preparedContentContentStage.blockedFrameResult",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentContentStage.preparedContentFramePublication",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentContentStep.frameResult",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentContentStep.preparedContentFramePublication",
    );
    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationContentResolution",
    );
    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowPreparedContentFramePublicationContentResolution",
    );
    expect(flowFrameSource).not.toContain("content-frame-result");
    expect(flowFrameSource).not.toContain("published-outcome-frame");
    expect(flowFrameSource).not.toContain("prepared-content-frame-publication");
    expect(flowFrameSource).not.toContain("onPreparedContentPrepared");
    expect(flowFrameSource).not.toContain("onPreparedContentPublished");
    expect(flowFrameSource).not.toContain("onRetainedDisplayPublished");
    expect(flowFrameSource).toContain(
      "runRetainedPreparedContentFramePublicationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "prepareRetainedDisplayPublicationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "preparePreparedContentFramePublicationFramePlan",
    );
    expect(surfaceFrameSource).toContain(
      "runRetainedPreparedContentFramePublicationContentStage",
    );
    expect(surfaceFrameSource).not.toContain(
      "prepareRetainedDisplayPublicationFramePlan",
    );
    expect(surfaceFrameSource).not.toContain(
      "preparePreparedContentFramePublicationFramePlan",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePublicationActionFrameResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePublicationFramePlanResult",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(readFileSync(COORDINATOR_MODULE_PATH, "utf8")).not.toMatch(
      /(?:apply|create)GpuFlow(?:RetainedDisplay|PreparedContent)PublicationContentStage/,
    );
    expect(coordinatorSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(coordinatorSource).not.toContain(
      "function resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(stateMachineSource).toContain(
      "export function resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(stateMachineSource).toContain(
      "function resolveGpuFlowPreparedContentFramePublicationActionFrameResult",
    );
    expect(stateMachineSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePublicationActionFrameResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function resolveGpuFlowPreparedContentFramePublicationActionFrameResult",
    );
    expect(stateMachineSource).toContain(
      "export function resolveGpuFlowPreparedContentFramePublicationFramePlanResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function resolveGpuFlowPreparedContentFramePublicationFramePlanResult",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowPreparedContentFramePublicationFramePlan",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowPreparedContentFramePublicationFramePlan",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowPreparedContentFramePublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toContain(
      "resolveGpuFlowPreparedContentFramePublicationReadiness",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowPreparedContentHeldPreviousPublicationTransaction",
    );
    expect(contentPlanSource).not.toContain(
      "shouldPreservePreparedContentFrameForBrowserVisualRepair",
    );
    expect(contentPlanSource).toContain("nodeLayerFrameResult:");
    expect(contentPlanSource).toContain(
      "publishedOutcomeFrame: framePlanResult.publishedOutcomeFrame",
    );
    expect(contentPlanSource).toContain("prepareContentFrame?.(");
    expect(contentPreparationSource).not.toContain("prepareContentFrame?.(");
    expect(contentPreparationSource).toContain(
      "shouldPrepareHtmlSurfaceOverlayTextures",
    );
  });

  it("keeps prepared-content-frame transaction candidate reduction in the state machine authority", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const contentDecisionKernelSource = readFileSync(
      CONTENT_DECISION_KERNEL_MODULE_PATH,
      "utf8",
    );
    const kernelModuleSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const stateMachineSource = readFileSync(STATE_MACHINE_MODULE_PATH, "utf8");

    expect(contentPlanSource).not.toContain(
      "export function prepareGpuFlowPreparedContentFramePublicationCandidate",
    );
    expect(contentPlanSource).not.toContain(
      "resolveGpuFlowPreparedContentFramePublicationReadiness",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowPreparedContentHeldPreviousPublicationTransaction",
    );
    expect(stateMachineSource).toContain(
      "export function reduceGpuFlowPreparedContentFramePublicationCandidate",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function prepareGpuFlowPreparedContentFramePublicationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "prepareGpuFlowPreparedContentFramePublicationCandidate",
    );
    expect(stateMachineSource).toContain(
      "resolveGpuFlowPreparedContentFramePublicationReadiness",
    );
    expect(stateMachineSource).not.toContain(
      "createGpuFlowPreparedContentHeldPreviousPublicationTransaction",
    );
    expect(stateMachineSource).toContain('"nonpublishable"');
    expect(stateMachineSource).toContain('"blocked-candidate"');
    expect(contentDecisionKernelSource).not.toContain('"nonpublishable"');
    expect(contentDecisionKernelSource).not.toContain('"blocked-candidate"');
  });

  it("keeps prepared-content-frame frame-plan selection in the state machine authority", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const contentDecisionKernelSource = readFileSync(
      CONTENT_DECISION_KERNEL_MODULE_PATH,
      "utf8",
    );
    const stateMachineSource = readFileSync(STATE_MACHINE_MODULE_PATH, "utf8");

    expect(contentPlanSource).not.toContain(
      "export function selectGpuFlowPreparedContentFramePublicationFramePlan",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePublicationActionFrameResult",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowNodeLayerPreparedContentFramePublicationResult",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowPreparedContentFramePublicationFramePlan",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowPreparedContentFramePublicationFramePlan",
    );
    expect(stateMachineSource).toContain(
      "function resolveGpuFlowPreparedContentFramePublicationActionFrameResult",
    );
    expect(stateMachineSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePublicationActionFrameResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function resolveGpuFlowPreparedContentFramePublicationActionFrameResult",
    );
    expect(stateMachineSource).toContain(
      "export function resolveGpuFlowPreparedContentFramePublicationFramePlanResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function resolveGpuFlowPreparedContentFramePublicationFramePlanResult",
    );
    expect(stateMachineSource).toContain(
      "createGpuFlowNodeLayerPreparedContentFramePublicationResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "createGpuFlowNodeLayerPreparedContentFramePublicationResult",
    );
  });

  it("keeps retained-display outcome selection in the state machine authority", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const contentDecisionKernelSource = readFileSync(
      CONTENT_DECISION_KERNEL_MODULE_PATH,
      "utf8",
    );
    const stateMachineSource = readFileSync(STATE_MACHINE_MODULE_PATH, "utf8");

    expect(contentPlanSource).not.toContain(
      "export function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(contentPlanSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate(",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(stateMachineSource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
  });

  it("keeps content blocked-candidate selection in the state machine authority", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const contentDecisionKernelSource = readFileSync(
      CONTENT_DECISION_KERNEL_MODULE_PATH,
      "utf8",
    );
    const stateMachineSource = readFileSync(STATE_MACHINE_MODULE_PATH, "utf8");

    expect(contentPlanSource).not.toContain(
      "export function selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidate(",
    );
    expect(stateMachineSource).toContain(
      "function selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(stateMachineSource).not.toContain(
      "export function selectGpuFlowContentPublicationBlockedCandidate({",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowContentPublicationBlockedCandidateForFrameResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowContentPublicationBlockedCandidateForFrameResult",
    );
    expect(stateMachineSource).toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidate",
    );
    expect(stateMachineSource).not.toContain(
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
      "resolveGpuFlowPreparedContentFramePublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).toContain(
      "function resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).toContain(
      "function resolveGpuFlowPreparedContentFramePublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePublicationFramePlanNodeLayerResult",
    );
  });

  it("resolves blocked prepared-content-frame abort instructions outside completion", () => {
    const blockedPreparedFrame = createPreparedContentFrame(8);
    const heldPreparedFrame = createPreparedContentFrame(9);
    const preparedContentFrame = createPreparedContentFrame(10);
    const explicitBlockedAbort =
      resolveGpuFlowBlockedPreparedContentFramePublicationAbort({
        blockedPreparedContentFrame: blockedPreparedFrame,
        blockedPreservePreparationSnapshot: true,
        preparedContentFrame: preparedContentFrame,
        heldPreparedContentFrame: heldPreparedFrame,
        selectedVisibleProjectionState: visibleProjectionState(
          "content-publication",
        ),
      });
    const heldPreviousBlockedAbort =
      resolveGpuFlowBlockedPreparedContentFramePublicationAbort({
        blockedPreparedContentFrame: null,
        blockedPreservePreparationSnapshot: false,
        preparedContentFrame: preparedContentFrame,
        heldPreparedContentFrame: heldPreparedFrame,
        selectedVisibleProjectionState: visibleProjectionState("held-previous"),
      });
    const blockedProofHeldCandidateAbort =
      resolveGpuFlowBlockedPreparedContentFramePublicationAbort({
        blockedPreparedContentFrame: null,
        blockedPreservePreparationSnapshot: false,
        preparedContentFrame: preparedContentFrame,
        heldPreparedContentFrame: heldPreparedFrame,
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
    expect(completionSource).toContain(
      "resolveGpuFlowBlockedPreparedContentFramePublicationAbort",
    );
  });

  it("does not derive retained display follow-up frames from retained candidates", () => {
    const retainedDisplayFrame = {} as RetainedDisplayFrame;
    const prepareRetainedDisplayPublicationFramePlan =
      createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
        contentDecisionKernel,
        previousVisibleProjectionState: null,
        prepareRetainedDisplayPublicationCandidate: () => ({
          prePublishRetainedPageMaintenance: null,
          retainedDisplayOutcome: {
            frame: retainedDisplayFrame,
            kind: "publish-exact",
          },
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
    ).toBeNull();
    expect(
      prepareRetainedDisplayPublicationFramePlan({
        deferResolutionUpdates: true,
      } as Parameters<typeof prepareRetainedDisplayPublicationFramePlan>[0])
        .followUpFrameReason,
    ).toBeNull();
  });

  it("keeps retained true-hole candidate repair scheduled", () => {
    const retainedDisplayFrame = {
      diagnostics: { trueHoleRectCount: 1 },
    } as RetainedDisplayFrame;
    const prepareRetainedDisplayPublicationFramePlan =
      createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
        contentDecisionKernel,
        previousVisibleProjectionState: null,
        prepareRetainedDisplayPublicationCandidate: () => ({
          prePublishRetainedPageMaintenance: null,
          retainedDisplayOutcome: {
            frame: retainedDisplayFrame,
            kind: "publish-exact",
          },
          retainedDisplayTransactionMs: 0,
          retainedPageMaintenanceMs: 0,
          retainedPagePreparedFrame:
            {} as RetainedContentTexturePagePreparedFrame,
        }),
      });

    expect(
      prepareRetainedDisplayPublicationFramePlan({
        deferResolutionUpdates: true,
      } as Parameters<typeof prepareRetainedDisplayPublicationFramePlan>[0])
        .followUpFrameReason,
    ).toBe("texture-upload");
  });

  it("converts prepared-content-frame publication blocks through the combined content stage", () => {
    const candidateFrame = createPreparedContentFrame();
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
    const preparePreparedContentFramePublicationFramePlan =
      createGpuFlowPreparedContentFramePublicationFramePlanPreparer({
        contentDecisionKernel,
        preparePreparedContentFramePublicationCandidate: () => ({
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
    const result =
      runGpuFlowRetainedPreparedContentFramePublicationContentStage<
        { readonly marker: string },
        never
      >({
        contentDecisionKernel,
        deferBrowserVisualWakeup: false,
        deferResolutionUpdates: false,
        frameReasons: ["texture-upload"],
        liveProjectionSample: liveProjectionSample(),
        onPreparedContentFrameCandidateAccepted: () => {
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
        prepareContentFrame: () => candidateFrame,
        preparePreparedContentFramePublicationFramePlan,
        prepareRetainedDisplayPublicationFramePlan:
          createPublishedRetainedDisplayPublicationFramePlan({
            publishedRetainedFrame,
          }),
        previousVisibleProjectionState: null,
        contentWorkLane: "content",
        retainedDisplayPublicationInput:
          retainedDisplayPublicationInputFixture(),
      });

    expect(result).toEqual(
      expect.objectContaining({
        blockedErrorMessage: "blocked surface",
        blockedPreparedContentFrame: candidateFrame,
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
    const preparedFrameForPublication = createPreparedContentFrame(12);
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
    const preparedContentFramePublication = {
      blockedSurfacePublication: null,
      preparedContentFrame: preparedFrameForPublication,
      heldPreparedContentFrame: null,
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
    const preparePreparedContentFramePublicationFramePlan: GpuFlowPreparedContentFramePublicationFramePlanPreparer =
      (input) => {
        calls.push("committed-plan");
        expect(input.preparedContentFrame).toBe(preparedFrameForPublication);
        expect(input.publishedRetainedFrame).toBe(publishedRetainedFrame);
        return {
          candidate: { kind: "publish" },
          preparedContentFramePublication,
          framePlan: {
            blockedPublicationCandidate: null,
            preparedContentFramePublication,
            kind: "publish",
            visibleProjectionState: null,
          },
          framePlanResult: {
            blockedPublicationCandidate: null,
            preparedContentFramePublication,
            visibleProjectionState: null,
          },
          nodeLayerFrameResult: null,
          shouldPrepareHtmlSurfaceOverlayTextures: false,
        };
      };
    const result =
      runGpuFlowRetainedPreparedContentFramePublicationContentStage<
        { readonly marker: string },
        string
      >({
        contentDecisionKernel,
        deferBrowserVisualWakeup: true,
        deferResolutionUpdates: false,
        frameReasons: ["texture-upload"],
        liveProjectionSample: liveProjectionSample(),
        onPreparedContentFrameCandidatePrepared: ({
          context,
          preparedContentFrame: preparedFrame,
          retainedDisplayFollowUpFrameReason,
        }) => {
          calls.push("committed-prepared");
          expect(context.marker).toBe("retained-published");
          expect(preparedFrame).toBe(preparedFrameForPublication);
          expect(retainedDisplayFollowUpFrameReason).toBe("texture-upload");
        },
        onPreparedContentFrameCandidateAccepted: ({
          preparedContentFramePublication: publication,
          context,
        }) => {
          calls.push("committed-published");
          expect(context.marker).toBe("retained-published");
          expect(publication).toBe(preparedContentFramePublication);
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
        prepareContentFrame: (frame, options) => {
          calls.push("prepared-content-frame");
          expect(frame).toBe(publishedRetainedFrame);
          expect(options).toEqual({ gpuNativeVisuals: undefined });
          return preparedFrameForPublication;
        },
        preparePreparedContentFramePublicationFramePlan,
        prepareRetainedDisplayPublicationFramePlan,
        previousVisibleProjectionState: null,
        contentWorkLane: "content",
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
      "prepared-content-frame",
      "committed-plan",
      "committed-prepared",
      "committed-published",
    ]);
  });

  it("gates prepared-content-frame overlay texture preparation outside flowFrame", () => {
    const preparedInputs: number[] = [];

    const skipped =
      prepareGpuFlowPreparedContentFrameOverlayTexturesForPublicationCandidate({
        input: 1,
        prepareOverlayTextures: (input) => preparedInputs.push(input),
        publicationPreparation: {
          shouldPrepareHtmlSurfaceOverlayTextures: false,
        },
      });
    const prepared =
      prepareGpuFlowPreparedContentFrameOverlayTexturesForPublicationCandidate({
        input: 2,
        prepareOverlayTextures: (input) => {
          preparedInputs.push(input);
          return input * 2;
        },
        publicationPreparation: {
          shouldPrepareHtmlSurfaceOverlayTextures: true,
        },
      });

    expect(preparedInputs).toEqual([2]);
    expect(skipped).toBeUndefined();
    expect(prepared).toBe(4);
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

function createPreparedContentFrame(
  displayFrameId = 7,
): GpuFlowPreparedContentFrame {
  return {
    displayFrameId,
  } as GpuFlowPreparedContentFrame;
}

function liveProjectionSample(): GpuFlowLiveProjectionSample {
  return {
    id: 17,
    timestamp: 24,
  } as GpuFlowLiveProjectionSample;
}

function preparedContentFramePublicationCandidateInput({
  preparedContentFrame,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
}): GpuFlowPreparedContentFramePublicationCandidateInput {
  return {
    committedGpuNativeVisuals: undefined,
    frameReasons: ["manual"],
    heldPreviousProjectionState: null,
    liveProjectionSample: liveProjectionSample(),
    contentWorkLane: "content",
    preparedContentFrame,
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
    preparedContentFrame: {
      displayFrameId: 12,
    },
    transaction: { kind },
  } as GpuFlowVisibleProjectionState;
}
