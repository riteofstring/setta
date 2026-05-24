import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const COORDINATOR_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameCoordinator.ts", import.meta.url),
);
const STATE_MACHINE_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameStateMachine.ts", import.meta.url),
);
const STATE_MACHINE_REDUCTION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameStateMachineReduction.ts", import.meta.url),
);
const CONTENT_DECISION_KERNEL_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFrameActorAdapters/contentDecisionKernel.ts",
    import.meta.url,
  ),
);
const SCHEDULING_REDUCTION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationDebt.ts", import.meta.url),
);
const AUTHORITY_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresentationProofs.ts", import.meta.url),
);
const TOKEN_AUTHORITY_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresentationTokens.ts", import.meta.url),
);
const COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameOutcomeReport.ts", import.meta.url),
);
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameSurfaceFrame.ts", import.meta.url),
);
const SURFACE_PUBLICATION_COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresentation.ts", import.meta.url),
);
const SURFACE_PUBLICATION_DEBT_REQUESTS_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresentationDebtRequests.ts", import.meta.url),
);
const SURFACE_PUBLICATION_DEBT_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfacePublicationDebtFrame.ts", import.meta.url),
);
const FORCED_BLOCKED_CANDIDATE_SET_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameForcedBlockedCandidateSet.ts", import.meta.url),
);

describe("GPU Flow visible frame coordinator phases", () => {
  it("keeps publication lane selection inside the visible-frame reducer", () => {
    const schedulingReductionSource = readFileSync(
      SCHEDULING_REDUCTION_MODULE_PATH,
      "utf8",
    );
    const stateMachineSource = readFileSync(STATE_MACHINE_MODULE_PATH, "utf8");
    const stateMachineReductionSource = readFileSync(
      STATE_MACHINE_REDUCTION_MODULE_PATH,
      "utf8",
    );

    expect(schedulingReductionSource).not.toContain(
      "reduceGpuFlowVisibleFramePublicationLane({",
    );
    expect(schedulingReductionSource).not.toContain(
      "createGpuFlowVisibleFrameReducerDecisionForLane",
    );
    expect(stateMachineReductionSource).toContain(
      "export function reduceGpuFlowVisibleFrameReducerDecision",
    );
    expect(stateMachineReductionSource).toContain(
      "reduceGpuFlowVisibleFramePublicationLane({",
    );
    expect(stateMachineReductionSource).toContain(
      "createGpuFlowVisibleFrameReducerDecisionForLane",
    );
    expect(stateMachineSource).toContain(
      'from "./visibleFrameStateMachineReduction"',
    );
  });

  it("runs sample, one reducer, and publish through one transaction authority", () => {
    const source = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const authoritySource = readFileSync(AUTHORITY_MODULE_PATH, "utf8");
    const tokenAuthoritySource = readFileSync(
      TOKEN_AUTHORITY_MODULE_PATH,
      "utf8",
    );
    const runStart = source.indexOf(
      "export function runGpuFlowVisibleFrameCoordinator",
    );
    const firstHelperStart = source.indexOf(
      "function sampleGpuFlowVisibleFramePublicationTransaction",
    );
    const runSource = source.slice(runStart, firstHelperStart);

    expect(runStart).toBeGreaterThanOrEqual(0);
    expect(firstHelperStart).toBeGreaterThan(runStart);
    expectOrderedPhases(runSource, [
      "sampleGpuFlowVisibleFramePublicationTransaction({",
      "reduceGpuFlowVisibleFramePublicationFrame({",
      "publishGpuFlowVisibleFramePublicationOutcome({",
    ]);
    expect(runSource).not.toContain(
      "prepareGpuFlowVisibleFramePublicationCandidateSet({",
    );
    expect(runSource).not.toContain(
      "proveGpuFlowVisibleFramePublicationPresentation({",
    );
    expect(runSource).not.toContain("createGpuFlowVisibleFrameStateMachine({");
    expect(runSource).not.toContain("stateMachine.runFrame();");
    const reducerStart = source.indexOf(
      "function reduceGpuFlowVisibleFramePublicationFrame",
    );
    const reducerEnd = source.indexOf(
      "function prepareGpuFlowVisibleFramePublicationCandidateSet",
      reducerStart,
    );
    const reducerSource = source.slice(reducerStart, reducerEnd);
    const publishStart = source.indexOf(
      "function publishGpuFlowVisibleFramePublicationOutcome",
    );
    const publishEnd = source.indexOf(
      "function createGpuFlowVisibleFrameRequestFacts",
      publishStart,
    );
    const publishSource = source.slice(publishStart, publishEnd);
    expect(reducerStart).toBeGreaterThan(firstHelperStart);
    expect(reducerEnd).toBeGreaterThan(reducerStart);
    expect(publishStart).toBeGreaterThan(reducerEnd);
    expect(publishEnd).toBeGreaterThan(publishStart);
    expectOrderedPhases(reducerSource, [
      "createGpuFlowVisibleFrameRequestFacts({",
      "reduceGpuFlowVisibleFrameReducerDecision({",
      "createGpuFlowVisibleFramePublicationFrameContext({",
      "prepareVisibleFrameResourcesForBudget?.(",
      "prepareGpuFlowVisibleFramePublicationCandidateSet({",
      "createGpuFlowVisibleFramePublicationPreparedFrame({",
      "proveGpuFlowVisibleFramePublicationPresentation(",
    ]);
    expectOrderedPhases(publishSource, [
      "presentGpuFlowVisibleFramePublicationFrame({",
      "publish?.(transaction);",
    ]);
    expect(publishSource).not.toContain(
      "prepareVisibleFrameResourcesForBudget?.(",
    );
    expect(source).toContain(
      "function sampleGpuFlowVisibleFramePublicationTransaction",
    );
    expect(source).toContain(
      "function prepareGpuFlowVisibleFramePublicationCandidateSet",
    );
    expect(source).toContain(
      "function createGpuFlowVisibleFramePublicationPreparedFrame",
    );
    expect(source).not.toContain(
      "function proveGpuFlowVisibleFramePublicationCandidateSet",
    );
    expect(source).toContain(
      "createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory()({",
    );
    expect(source).not.toContain(
      "function createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame",
    );
    expect(source).not.toMatch(
      /export\s*\{[\s\S]*createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory[\s\S]*\}\s+from "\.\/visibleFrameTransactionProofs"/,
    );
    expect(source).not.toMatch(
      /export\s*\{[\s\S]*createGpuFlowVisibleFramePublicationPreparedFrameSelector[\s\S]*\}\s+from "\.\/visibleFrameTransactionProofs"/,
    );
    expect(source).not.toMatch(
      /export\s*\{[\s\S]*createGpuFlowVisibleFramePublicationTransactionProofFactory[\s\S]*\}\s+from "\.\/visibleFrameTransactionProofs"/,
    );
    expect(source).not.toContain(
      "function reduceGpuFlowVisibleFramePublicationTransaction",
    );
    expect(source).toContain('from "./visibleFramePresentationProofs"');
    expect(authoritySource).toContain(
      "export function proveGpuFlowVisibleFramePublicationPresentation",
    );
    expect(tokenAuthoritySource).toContain(
      "visiblePublicationTokenIssuer.createPresentationToken",
    );
    expect(source).toContain(
      "function publishGpuFlowVisibleFramePublicationOutcome",
    );
    expect(source).not.toContain(
      "export function completeGpuFlowVisibleFramePublicationTransaction",
    );
    expect(source).not.toContain(
      "export function createGpuFlowVisiblePublicationCompletionOutcome",
    );
    expect(source).not.toContain(
      "export function selectGpuFlowVisibleFramePublicationTransaction",
    );
    expect(source).not.toContain("reducerRuntime.selectFrame({");
    expect(source).not.toContain(
      "prepareGpuFlowForcedBlockedVisibleFramePublicationCandidateSet",
    );
    expect(existsSync(FORCED_BLOCKED_CANDIDATE_SET_MODULE_PATH)).toBe(false);
  });

  it("keeps content and motion outcome branches inside the visible-frame reducer", () => {
    const coordinatorSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const contentDecisionKernelSource = readFileSync(
      CONTENT_DECISION_KERNEL_MODULE_PATH,
      "utf8",
    );
    const stateMachineSource = readFileSync(STATE_MACHINE_MODULE_PATH, "utf8");
    const stateMachineReductionSource = readFileSync(
      STATE_MACHINE_REDUCTION_MODULE_PATH,
      "utf8",
    );

    expect(coordinatorSource).toContain(
      "reduceGpuFlowMotionProjectionFramePreparation({",
    );
    expect(coordinatorSource).not.toContain(
      "reduceGpuFlowVisibleFrameMotionProjectionTransaction({",
    );
    expect(coordinatorSource).not.toContain(
      "projectionFrameTransaction.blockedPublicationCandidate",
    );
    expect(coordinatorSource).not.toContain("createBlockedProjectionFrame({");
    expect(stateMachineSource).toContain(
      'from "./visibleFrameStateMachineReduction"',
    );
    expect(stateMachineReductionSource).toContain(
      "export function reduceGpuFlowMotionProjectionFramePreparation",
    );
    expect(stateMachineReductionSource).toContain(
      "export function reduceGpuFlowVisibleFrameMotionProjectionTransaction",
    );
    expect(stateMachineReductionSource).toContain(
      "projectionFrameTransaction.blockedPublicationCandidate",
    );
    expect(stateMachineReductionSource).toContain(
      "createBlockedProjectionFrame({",
    );

    expect(contentDecisionKernelSource).not.toContain('"nonpublishable"');
    expect(contentDecisionKernelSource).not.toContain('"blocked-candidate"');
    expect(contentDecisionKernelSource).not.toContain(
      "createGpuFlowNodeLayerPreparedContentFramePublicationResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowPreparedContentFramePublicationFramePlan",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowPreparedContentFramePublicationFramePlan",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowContentPublicationBlockedCandidateForFrameResult",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowRetainedDisplayPublicationFramePlan",
    );
    expect(stateMachineSource).toContain('"nonpublishable"');
    expect(stateMachineSource).toContain('"blocked-candidate"');
  });

  it("keeps transaction proof, reducer completion, and reducer decision out of the surface frame adapter", () => {
    const source = readFileSync(SURFACE_FRAME_PUBLICATION_MODULE_PATH, "utf8");

    expect(source).not.toContain(
      "createGpuFlowVisibleFramePublicationTransactionProof(",
    );
    expect(source).not.toContain(
      "proveGpuFlowVisibleFramePublicationCandidateSet",
    );
    expect(source).not.toContain(
      "proveGpuFlowVisibleFramePublicationPresentation",
    );
    expect(source).not.toContain(
      "completeGpuFlowVisibleFramePublicationTransaction",
    );
    expect(source).not.toContain(
      "selectGpuFlowVisibleFramePublicationTransaction",
    );
    expect(source).not.toContain("selectProjectionFrameTransaction");
    expect(source).not.toContain("selectRetainedProjectionReducerDecision");
    expect(source).not.toContain(
      "selectContentPublicationBlockedCandidateForFrameResult",
    );
    expect(source).not.toContain(
      "visibleFrameReducerRuntimeRef.current.getKnobs",
    );
    expect(source).not.toMatch(
      /\.(?:selectFrame|completeFrame|recordUnpresentedFrame)\s*\(/,
    );
  });

  it("keeps frame-context deferral decisions private to the coordinator", () => {
    const coordinatorSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const surfaceSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );

    expect(coordinatorSource).toContain(
      "function shouldDeferGpuFlowResolutionUpdates",
    );
    expect(coordinatorSource).not.toContain(
      "export function shouldDeferGpuFlowResolutionUpdates",
    );
    expect(surfaceSource).not.toContain("shouldDeferGpuFlowResolutionUpdates");
    expect(surfaceSource).toContain("publicationFrameContext");
  });

  it("keeps visible outcome token minting in the coordinator", () => {
    const coordinatorSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const authoritySource = readFileSync(TOKEN_AUTHORITY_MODULE_PATH, "utf8");
    const presentationProofSource = readFileSync(AUTHORITY_MODULE_PATH, "utf8");
    const completionSource = readFileSync(COMPLETION_MODULE_PATH, "utf8");
    const rawTokenConstructors = [
      "createGpuFlowBlockedPublicationToken",
      "createGpuFlowVisibleFramePresentationToken",
      "createGpuFlowHoldPreviousToken",
      "createGpuFlowPresentableFrame",
    ] as const;

    expect(authoritySource).toContain(
      "createGpuFlowVisiblePublicationTokenIssuer",
    );
    expect(authoritySource).not.toContain(
      "export function createGpuFlowVisiblePublicationTokenIssuer",
    );
    expect(authoritySource).toContain(
      "visiblePublicationTokenIssuer.createPresentationToken",
    );
    expect(authoritySource).toContain(
      "visiblePublicationTokenIssuer.createBlockedPublicationToken",
    );
    expect(authoritySource).toContain(
      "visiblePublicationTokenIssuer.createHoldPreviousToken",
    );
    for (const constructorName of rawTokenConstructors) {
      expect(coordinatorSource).not.toContain(constructorName);
      expect(completionSource).not.toContain(constructorName);
      expect(authoritySource).toContain(`function ${constructorName}`);
      expect(authoritySource).not.toContain(
        `export function ${constructorName}`,
      );
    }
    expect(presentationProofSource).toContain("presentationAuthorityProof:");
    expect(presentationProofSource).toContain(
      "presentableFrameProof.presentationAuthorityProof",
    );
    expect(presentationProofSource).toContain(
      "function createGpuFlowVisibleFrameBlockedPublicationTokenForProof",
    );
    expect(authoritySource).not.toContain(
      "export function createGpuFlowVisibleFrameBlockedPublicationTokenForProof",
    );
    expect(authoritySource).toContain(
      "export function createGpuFlowVisiblePublicationCompletionPresentationToken",
    );
    expect(authoritySource).not.toContain(
      "visibleFramePublicationBlockedProofToken",
    );
  });

  it("keeps reducer debt frame requests private to publication completion", () => {
    const completionSource = readFileSync(
      SURFACE_PUBLICATION_COMPLETION_MODULE_PATH,
      "utf8",
    );
    const debtRequestsSource = readFileSync(
      SURFACE_PUBLICATION_DEBT_REQUESTS_MODULE_PATH,
      "utf8",
    );

    expect(existsSync(SURFACE_PUBLICATION_DEBT_FRAME_MODULE_PATH)).toBe(false);
    expect(debtRequestsSource).toContain(
      "function scheduleDelayedGpuFlowPublicationDebtFrame",
    );
    expect(debtRequestsSource).not.toContain(
      "export function scheduleDelayedGpuFlowPublicationDebtFrame",
    );
    expect(completionSource).not.toContain("flowSurfacePublicationDebtFrame");
  });
});

function expectOrderedPhases(
  source: string,
  phaseMarkers: readonly string[],
): void {
  let previousPhaseIndex = -1;
  for (const marker of phaseMarkers) {
    const phaseIndex = source.indexOf(marker);
    expect(phaseIndex, marker).toBeGreaterThan(previousPhaseIndex);
    previousPhaseIndex = phaseIndex;
  }
}
