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
import { resolveGpuFlowBlockedPreparedContentFramePresentationAbort } from "./visibleFrameAbortPolicy";
import { createGpuFlowVisibleFramePresentationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowPreparedContentFramePresentationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  runGpuFlowRetainedPreparedContentFramePresentationContentStage,
  type GpuFlowPreparedContentFramePresentationCandidateInput,
  type GpuFlowPreparedContentFramePresentationFramePlanPreparer,
  type GpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowVisibleFrameBlockedPresentationCandidate,
} from "./visibleFrameContentPlan";
import { prepareGpuFlowPreparedContentFrameOverlayTexturesForPresentationCandidate } from "./visibleFrameContentPreparation";

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
  it("keeps single-stage content preparation gates off the public surfaces", () => {
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const kernelModuleSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const contentPlanReExport =
      kernelModuleSource.match(
        /export \{[\s\S]*?\} from "\.\/visibleFrameContentPlan";/,
      )?.[0] ?? "";

    expect(contentPlanReExport).toContain(
      "createGpuFlowContentPreparationFrameResult",
    );
    expect(contentPlanReExport).not.toContain(
      "runGpuFlowRetainedDisplayPublicationContentStage",
    );
    expect(contentPlanReExport).not.toContain(
      "runGpuFlowPreparedContentFramePresentationContentStage",
    );
    expect(contentPlanReExport).not.toContain(
      "prepareGpuFlowPreparedContentFramePresentationFramePlanForRetainedDisplay",
    );
    expect(contentPlanReExport).not.toContain(
      "resolveGpuFlowPreparedContentFramePresentationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toMatch(
      /\bexport function (?:create|apply|run)GpuFlow(?:RetainedDisplay|PreparedContent)PublicationContentStage\b/,
    );
    expect(contentPlanSource).not.toContain(
      "export function prepareGpuFlowPreparedContentFramePresentationFramePlanForRetainedDisplay",
    );
    expect(contentPlanSource).not.toMatch(
      /\bexport function resolveGpuFlow(?:RetainedDisplay|PreparedContent)PublicationFramePlanNodeLayerResult\b/,
    );
  });

  it("selects prepared-content-frame present and blocked candidate plans outside flowFrame", () => {
    const preparedContentFrame = createPreparedContentFrame();
    const preparePublishPlan =
      createGpuFlowPreparedContentFramePresentationFramePlanPreparer({
        contentDecisionKernel,
        preparePreparedContentFramePresentationCandidate: () => ({
          kind: "present",
        }),
      });
    const prepareNonpublishablePlan =
      createGpuFlowPreparedContentFramePresentationFramePlanPreparer({
        contentDecisionKernel,
        preparePreparedContentFramePresentationCandidate: () => ({
          blockedPresentationCandidate: {
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
          kind: "blocked",
          preservePreparationSnapshot: true,
          resourceWork: {
            deferWakeup: false,
            timestamp: 16,
            workItems: [],
          },
        }),
      });
    const publishPlan = preparePublishPlan(
      preparedContentFramePresentationCandidateInput({
        preparedContentFrame: preparedContentFrame,
      }),
    ).framePlan;
    const blockedPlan = prepareNonpublishablePlan(
      preparedContentFramePresentationCandidateInput({
        preparedContentFrame: preparedContentFrame,
      }),
    ).framePlan;

    expect(publishPlan.kind).toBe("present");
    if (publishPlan.kind !== "present") {
      throw new Error("Expected prepared-content-frame publish plan.");
    }
    expect(
      publishPlan.preparedContentFramePresentation.preparedContentFrame,
    ).toBe(preparedContentFrame);
    expect(blockedPlan.kind).toBe("candidate");
    if (blockedPlan.kind !== "candidate") {
      throw new Error(
        "Expected prepared-content-frame blocked candidate plan.",
      );
    }
    expect(blockedPlan.visibleProjectionState).toBeNull();
    expect(blockedPlan.blockedPresentationCandidate).toEqual(
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

  it("creates prepared-content visible projection state for retained candidates", () => {
    const publication =
      contentDecisionKernel.createVisibleProjectionStateForRetainedPublication({
        frameReasons: ["texture-upload", "dom-control-activation"],
        liveProjectionSample: liveProjectionSample(),
        contentWorkLane: "content",
        preparedContentFrame: createPreparedContentFrame(48),
      });

    expect(publication.transaction.kind).toBe("prepared-content");
    expect(publication.preparedContentFrame.displayFrameId).toBe(48);
  });

  it("keeps content preparation selector factories off the coordinator public surface", () => {
    const kernelModuleSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");
    const contentDecisionKernelSource = readFileSync(
      CONTENT_DECISION_KERNEL_MODULE_PATH,
      "utf8",
    );

    expect(kernelModuleSource).not.toMatch(
      /export \{[\s\S]*createGpuFlow(?:PreparedContentFramePresentationFramePlanSelector|RetainedDisplayPublicationFramePlanSelector|ContentPreparationBlockedCandidateSelector)[\s\S]*\} from "\.\/visibleFrameActorAdapters\/contentDecisionKernel";/,
    );
    expect(kernelModuleSource).not.toContain(
      "export { prepareGpuFlowPreparedContentFramePresentationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "createGpuFlowPreparedContentFramePresentationFramePlanSelector();",
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
      /export function createGpuFlow(?:PreparedContentFramePresentationFramePlanSelector|RetainedDisplayPublicationFramePlanSelector|ContentPreparationBlockedCandidateSelector|PreparedContentFramePresentationFramePlanResultResolver|RetainedDisplayPublicationFramePlanResultResolver)/,
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
      "retainedDisplayPublicationFramePlanResult.blockedPresentationCandidate",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePresentationFramePlanResult.blockedPresentationCandidate",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePresentationFramePlanResult.visibleProjectionState",
    );
    expect(flowFrameSource).not.toContain("retainedDisplayOutcomeFrameResult");
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePresentationActionResult",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePresentationCandidateAction",
    );
    expect(flowFrameSource).not.toContain(
      "assertGpuFlowPreparedContentFramePresentationCandidatePublished",
    );
    expect(flowFrameSource).not.toContain(
      "selectRetainedDisplayPublicationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "selectPreparedContentFramePresentationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationFramePlan.kind",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePresentationFramePlan.kind",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePresentationCandidate.kind",
    );
    expect(flowFrameSource).not.toContain("publicationKind");
    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationPreparation.nodeLayerFrameResult",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePresentationPreparation.nodeLayerFrameResult",
    );
    expect(flowFrameSource).not.toContain(
      "retainedDisplayPublicationPreparation.publishedOutcomeFrame",
    );
    expect(flowFrameSource).not.toContain("framePlanResult");
    expect(flowFrameSource).not.toContain(
      "createGpuFlowContentPreparationFrameResultForRetainedDisplayPublicationPreparation",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowContentPreparationFrameResultForPreparedContentFramePresentationPreparation",
    );
    expect(flowFrameSource).not.toContain(
      "requireGpuFlowRetainedDisplayPublishedOutcomeFrame",
    );
    expect(contentPlanSource).not.toMatch(
      /export function createGpuFlowContentPreparationFrameResultForRetainedDisplayPublicationPreparation/,
    );
    expect(contentPlanSource).not.toMatch(
      /export function createGpuFlowContentPreparationFrameResultForPreparedContentFramePresentationPreparation/,
    );
    expect(contentPlanSource).not.toMatch(
      /export function requireGpuFlowRetainedDisplayPublishedOutcomeFrame/,
    );
    expect(flowFrameSource).not.toMatch(
      /\b(?:create|apply)GpuFlow(?:RetainedDisplay|PreparedContent)PublicationContentStage\b/,
    );
    expect(flowFrameSource).not.toContain("onRetainedDisplayFrame?.");
    expect(flowFrameSource).not.toContain(
      "preparedContentFramePresentationPreparation.shouldPrepareHtmlSurfaceOverlayTextures",
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
      "createGpuFlowPreparedContentFramePresentationContentStep",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowPreparedContentFramePresentationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "applyGpuFlowPreparedContentFramePresentationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "runGpuFlowPreparedContentFramePresentationContentStage",
    );
    expect(flowFrameSource).not.toContain("preparedContentContentStage.kind");
    expect(flowFrameSource).not.toContain(
      "preparedContentContentStage.blockedFrameResult",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentContentStage.preparedContentFramePresentation",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentContentStep.frameResult",
    );
    expect(flowFrameSource).not.toContain(
      "preparedContentContentStep.preparedContentFramePresentation",
    );
    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationContentResolution",
    );
    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowPreparedContentFramePresentationContentResolution",
    );
    expect(flowFrameSource).not.toContain("content-frame-result");
    expect(flowFrameSource).not.toContain("published-outcome-frame");
    expect(flowFrameSource).not.toContain("prepared-content-frame-publication");
    expect(flowFrameSource).not.toContain("onPreparedContentPrepared");
    expect(flowFrameSource).not.toContain("onPreparedContentPublished");
    expect(flowFrameSource).not.toContain("onRetainedDisplayPublished");
    expect(flowFrameSource).toContain(
      "runRetainedPreparedContentFramePresentationContentStage",
    );
    expect(flowFrameSource).not.toContain(
      "prepareRetainedDisplayPublicationFramePlan",
    );
    expect(flowFrameSource).not.toContain(
      "preparePreparedContentFramePresentationFramePlan",
    );
    expect(surfaceFrameSource).toContain(
      "runRetainedPreparedContentFramePresentationContentStage",
    );
    expect(surfaceFrameSource).not.toContain(
      "prepareRetainedDisplayPublicationFramePlan",
    );
    expect(surfaceFrameSource).not.toContain(
      "preparePreparedContentFramePresentationFramePlan",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePresentationActionFrameResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayPublicationFramePlanResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePresentationFramePlanResult",
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
      "function resolveGpuFlowPreparedContentFramePresentationActionFrameResult",
    );
    expect(stateMachineSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePresentationActionFrameResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function resolveGpuFlowPreparedContentFramePresentationActionFrameResult",
    );
    expect(stateMachineSource).toContain(
      "export function resolveGpuFlowPreparedContentFramePresentationFramePlanResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function resolveGpuFlowPreparedContentFramePresentationFramePlanResult",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowPreparedContentFramePresentationFramePlan",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowPreparedContentFramePresentationFramePlan",
    );
    expect(contentPlanSource).toContain(
      "resolveGpuFlowPreparedContentFramePresentationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toContain(
      "resolveGpuFlowPreparedContentFramePresentationReadiness",
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
      "export function prepareGpuFlowPreparedContentFramePresentationCandidate",
    );
    expect(contentPlanSource).not.toContain(
      "resolveGpuFlowPreparedContentFramePresentationReadiness",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowPreparedContentHeldPreviousPublicationTransaction",
    );
    expect(stateMachineSource).toContain(
      "export function reduceGpuFlowPreparedContentFramePresentationCandidate",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function prepareGpuFlowPreparedContentFramePresentationCandidate",
    );
    expect(kernelModuleSource).not.toContain(
      "prepareGpuFlowPreparedContentFramePresentationCandidate",
    );
    expect(stateMachineSource).toContain(
      "resolveGpuFlowPreparedContentFramePresentationReadiness",
    );
    expect(stateMachineSource).not.toContain(
      "createGpuFlowPreparedContentHeldPreviousPublicationTransaction",
    );
    expect(stateMachineSource).toContain('"blocked"');
    expect(stateMachineSource).toContain('"blocked-candidate"');
    expect(contentDecisionKernelSource).not.toContain('"blocked"');
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
      "export function selectGpuFlowPreparedContentFramePresentationFramePlan",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePresentationActionFrameResult",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowNodeLayerPreparedContentFramePresentationResult",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowPreparedContentFramePresentationFramePlan",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowPreparedContentFramePresentationFramePlan",
    );
    expect(stateMachineSource).toContain(
      "function resolveGpuFlowPreparedContentFramePresentationActionFrameResult",
    );
    expect(stateMachineSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePresentationActionFrameResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function resolveGpuFlowPreparedContentFramePresentationActionFrameResult",
    );
    expect(stateMachineSource).toContain(
      "export function resolveGpuFlowPreparedContentFramePresentationFramePlanResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function resolveGpuFlowPreparedContentFramePresentationFramePlanResult",
    );
    expect(stateMachineSource).toContain(
      "createGpuFlowNodeLayerPreparedContentFramePresentationResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "createGpuFlowNodeLayerPreparedContentFramePresentationResult",
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
      "createGpuFlowRetainedProjectionBlockedPresentationCandidate(",
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
      "export function selectGpuFlowContentPreparationBlockedCandidate",
    );
    expect(contentPlanSource).not.toContain(
      "createGpuFlowBrowserVisualBlockedPresentationCandidate(",
    );
    expect(stateMachineSource).toContain(
      "function selectGpuFlowContentPreparationBlockedCandidate",
    );
    expect(stateMachineSource).not.toContain(
      "export function selectGpuFlowContentPreparationBlockedCandidate({",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowContentPreparationBlockedCandidate",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowContentPreparationBlockedCandidateForFrameResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowContentPreparationBlockedCandidateForFrameResult",
    );
    expect(stateMachineSource).toContain(
      "createGpuFlowBrowserVisualBlockedPresentationCandidate",
    );
    expect(stateMachineSource).not.toContain(
      "createGpuFlowBrowserVisualBlockedPresentationCandidateFactory",
    );
  });

  it("keeps candidate plan node-layer result conversion private to content plans", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");

    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowPreparedContentFramePresentationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).toContain(
      "function resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).toContain(
      "function resolveGpuFlowPreparedContentFramePresentationFramePlanNodeLayerResult",
    );
    expect(contentPlanSource).not.toContain(
      "export function resolveGpuFlowPreparedContentFramePresentationFramePlanNodeLayerResult",
    );
  });

  it("resolves blocked prepared-content-frame abort instructions outside completion", () => {
    const blockedPreparedFrame = createPreparedContentFrame(8);
    const heldPreparedFrame = createPreparedContentFrame(9);
    const preparedContentFrame = createPreparedContentFrame(10);
    const explicitBlockedAbort =
      resolveGpuFlowBlockedPreparedContentFramePresentationAbort({
        blockedPreparedContentFrame: blockedPreparedFrame,
        blockedPreservePreparationSnapshot: true,
        preparedContentFrame: preparedContentFrame,
        heldPreparedContentFrame: heldPreparedFrame,
        selectedVisibleProjectionState:
          visibleProjectionState("prepared-content"),
      });
    const heldPreviousBlockedAbort =
      resolveGpuFlowBlockedPreparedContentFramePresentationAbort({
        blockedPreparedContentFrame: null,
        blockedPreservePreparationSnapshot: false,
        preparedContentFrame: preparedContentFrame,
        heldPreparedContentFrame: heldPreparedFrame,
        selectedVisibleProjectionState: visibleProjectionState("held-previous"),
      });
    const blockedProofHeldCandidateAbort =
      resolveGpuFlowBlockedPreparedContentFramePresentationAbort({
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
      "resolveGpuFlowBlockedPreparedContentFramePresentationAbort",
    );
  });

  it("does not derive retained display follow-up frames from retained candidates", () => {
    const retainedDisplayFrame = {} as RetainedDisplayFrame;
    const prepareRetainedDisplayPublicationFramePlan =
      createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
        contentDecisionKernel,
        previousVisibleProjectionState: null,
        prepareRetainedDisplayPresentationCandidate: () => ({
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
        prepareRetainedDisplayPresentationCandidate: () => ({
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
    const blockedPresentationCandidate = {
      blockedReasons: [
        {
          actorId: "surface-a",
          family: "dom-control",
          reason: "snapshot-pending",
        },
      ],
      frozenFrameId: 9,
    } satisfies GpuFlowVisibleFrameBlockedPresentationCandidate;
    const preparePreparedContentFramePresentationFramePlan =
      createGpuFlowPreparedContentFramePresentationFramePlanPreparer({
        contentDecisionKernel,
        preparePreparedContentFramePresentationCandidate: () => ({
          blockedPresentationCandidate,
          candidateFrame,
          errorMessage: "blocked surface",
          kind: "blocked",
          preservePreparationSnapshot: true,
          resourceWork: {
            deferWakeup: false,
            timestamp: 24,
            workItems: [],
          },
        }),
      });
    const result =
      runGpuFlowRetainedPreparedContentFramePresentationContentStage<
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
        preparePreparedContentFramePresentationFramePlan,
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
        blockedPresentationCandidate,
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
    const preparedContentFramePresentation = {
      blockedSurfacePresentation: null,
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
            blockedPresentationCandidate: null,
            publishedOutcomeFrame,
          },
          nodeLayerFrameResult: null,
          publication: retainedDisplayPublication,
          publishedOutcomeFrame,
        };
      };
    const preparePreparedContentFramePresentationFramePlan: GpuFlowPreparedContentFramePresentationFramePlanPreparer =
      (input) => {
        calls.push("committed-plan");
        expect(input.preparedContentFrame).toBe(preparedFrameForPublication);
        expect(input.publishedRetainedFrame).toBe(publishedRetainedFrame);
        return {
          candidate: { kind: "present" },
          preparedContentFramePresentation,
          framePlan: {
            blockedPresentationCandidate: null,
            preparedContentFramePresentation,
            kind: "present",
            visibleProjectionState: null,
          },
          framePlanResult: {
            blockedPresentationCandidate: null,
            preparedContentFramePresentation,
            visibleProjectionState: null,
          },
          nodeLayerFrameResult: null,
          shouldPrepareHtmlSurfaceOverlayTextures: false,
        };
      };
    const result =
      runGpuFlowRetainedPreparedContentFramePresentationContentStage<
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
          preparedContentFramePresentation: publication,
          context,
        }) => {
          calls.push("committed-published");
          expect(context.marker).toBe("retained-published");
          expect(publication).toBe(preparedContentFramePresentation);
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
        preparePreparedContentFramePresentationFramePlan,
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
      prepareGpuFlowPreparedContentFrameOverlayTexturesForPresentationCandidate(
        {
          input: 1,
          prepareOverlayTextures: (input) => preparedInputs.push(input),
          presentationPreparation: {
            shouldPrepareHtmlSurfaceOverlayTextures: false,
          },
        },
      );
    const prepared =
      prepareGpuFlowPreparedContentFrameOverlayTexturesForPresentationCandidate(
        {
          input: 2,
          prepareOverlayTextures: (input) => {
            preparedInputs.push(input);
            return input * 2;
          },
          presentationPreparation: {
            shouldPrepareHtmlSurfaceOverlayTextures: true,
          },
        },
      );

    expect(preparedInputs).toEqual([2]);
    expect(skipped).toBeUndefined();
    expect(prepared).toBe(4);
  });

  it("keeps content preparation frame-result derivation out of the surface frame", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const contentPlanSource = readFileSync(CONTENT_PLAN_MODULE_PATH, "utf8");

    expect(surfaceFrameSource).not.toContain(
      "function createGpuFlowVisibleContentPreparationFrameResult",
    );
    expect(surfaceFrameSource).not.toContain(
      "function createGpuFlowNotVisibleContentPreparationFrameResult",
    );
    expect(surfaceFrameSource).not.toContain(
      "createGpuFlowContentPreparationFrameResultForNodeLayerFrame",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowContentPreparationFrameResultForNodeLayerFrame",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowVisibleProjectionStateForRetainedPublication",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowNodeLayerFrameVisibleProjectionStateResult",
    );
    expect(flowFrameSource).toContain(
      "createContentPreparationFrameResultForVisibleProjectionState",
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
      "function createGpuFlowVisibleContentPreparationFrameResult",
    );
    expect(contentPlanSource).toContain(
      "function createGpuFlowNotVisibleContentPreparationFrameResult",
    );
    expect(contentPlanSource).toContain(
      "function createGpuFlowContentPreparationFrameResultForVisibleProjectionState",
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

function preparedContentFramePresentationCandidateInput({
  preparedContentFrame,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
}): GpuFlowPreparedContentFramePresentationCandidateInput {
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
      blockedPresentationCandidate: null,
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
