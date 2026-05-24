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
  new URL("./visibleFrameReducerDebt.ts", import.meta.url),
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
  new URL("./flowSurfaceReducerDebtFrame.ts", import.meta.url),
);
const FORCED_BLOCKED_CANDIDATE_SET_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameForcedBlockedCandidateSet.ts", import.meta.url),
);

describe("GPU Flow visible frame coordinator phases", () => {
  it("keeps work lane selection inside the visible-frame reducer", () => {
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
      "reduceGpuFlowVisibleFrameWorkLane({",
    );
    expect(schedulingReductionSource).not.toContain(
      "createGpuFlowVisibleFrameReducerDecisionForLane",
    );
    expect(stateMachineReductionSource).toContain(
      "export function reduceGpuFlowVisibleFrameReducerDecision",
    );
    expect(stateMachineReductionSource).toContain(
      "reduceGpuFlowVisibleFrameWorkLane({",
    );
    expect(stateMachineReductionSource).toContain(
      "createGpuFlowVisibleFrameReducerDecisionForLane",
    );
    expect(stateMachineSource).toContain(
      'from "./visibleFrameStateMachineReduction"',
    );
  });

  it("runs sample, one reducer, and presentation through one transaction authority", () => {
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
      "function sampleGpuFlowVisibleFramePresentationTransaction",
    );
    const runSource = source.slice(runStart, firstHelperStart);

    expect(runStart).toBeGreaterThanOrEqual(0);
    expect(firstHelperStart).toBeGreaterThan(runStart);
    expectOrderedPhases(runSource, [
      "sampleGpuFlowVisibleFramePresentationTransaction({",
      "reduceGpuFlowVisibleFramePresentationFrame({",
      "presentGpuFlowVisibleFramePresentationOutcome({",
    ]);
    expect(runSource).not.toContain(
      "prepareGpuFlowVisibleFramePresentationCandidateSet({",
    );
    expect(runSource).not.toContain(
      "proveGpuFlowVisibleFramePresentationProof({",
    );
    expect(runSource).not.toContain("createGpuFlowVisibleFrameStateMachine({");
    expect(runSource).not.toContain("stateMachine.runFrame();");
    const reducerStart = source.indexOf(
      "function reduceGpuFlowVisibleFramePresentationFrame",
    );
    const reducerEnd = source.indexOf(
      "function prepareGpuFlowVisibleFramePresentationCandidateSet",
      reducerStart,
    );
    const reducerSource = source.slice(reducerStart, reducerEnd);
    const presentationStart = source.indexOf(
      "function presentGpuFlowVisibleFramePresentationOutcome",
    );
    const presentationEnd = source.indexOf(
      "function createGpuFlowVisibleFrameRequestFacts",
      presentationStart,
    );
    const presentationSource = source.slice(presentationStart, presentationEnd);
    expect(reducerStart).toBeGreaterThan(firstHelperStart);
    expect(reducerEnd).toBeGreaterThan(reducerStart);
    expect(presentationStart).toBeGreaterThan(reducerEnd);
    expect(presentationEnd).toBeGreaterThan(presentationStart);
    expectOrderedPhases(reducerSource, [
      "createGpuFlowVisibleFrameRequestFacts({",
      "reduceGpuFlowVisibleFrameReducerDecision({",
      "createGpuFlowVisibleFramePresentationFrameContext({",
      "prepareVisibleFrameResourcesForBudget?.(",
      "prepareGpuFlowVisibleFramePresentationCandidateSet({",
      "createGpuFlowVisibleFramePresentationPreparedFrame({",
      "proveGpuFlowVisibleFramePresentationProof(",
    ]);
    expectOrderedPhases(presentationSource, [
      "presentGpuFlowVisibleFramePresentationFrame({",
      "onPresentation?.(transaction);",
    ]);
    expect(presentationSource).not.toContain(
      "prepareVisibleFrameResourcesForBudget?.(",
    );
    expect(source).toContain(
      "function sampleGpuFlowVisibleFramePresentationTransaction",
    );
    expect(source).toContain(
      "function prepareGpuFlowVisibleFramePresentationCandidateSet",
    );
    expect(source).toContain(
      "function createGpuFlowVisibleFramePresentationPreparedFrame",
    );
    expect(source).not.toContain(
      "function proveGpuFlowVisibleFramePresentationCandidateSet",
    );
    expect(source).toContain(
      "createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory()({",
    );
    expect(source).not.toContain(
      "function createGpuFlowVisibleFramePresentationPreparedCandidateSetFrame",
    );
    expect(source).not.toMatch(
      /export\s*\{[\s\S]*createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory[\s\S]*\}\s+from "\.\/visibleFrameTransactionProofs"/,
    );
    expect(source).not.toMatch(
      /export\s*\{[\s\S]*createGpuFlowVisibleFramePresentationPreparedFrameSelector[\s\S]*\}\s+from "\.\/visibleFrameTransactionProofs"/,
    );
    expect(source).not.toMatch(
      /export\s*\{[\s\S]*createGpuFlowVisibleFramePresentationTransactionProofFactory[\s\S]*\}\s+from "\.\/visibleFrameTransactionProofs"/,
    );
    expect(source).not.toContain(
      "function reduceGpuFlowVisibleFramePresentationTransaction",
    );
    expect(source).toContain('from "./visibleFramePresentationProofs"');
    expect(authoritySource).toContain(
      "export function proveGpuFlowVisibleFramePresentationProof",
    );
    expect(tokenAuthoritySource).toContain(
      "visibleFramePresentationTokenIssuer.createPresentationToken",
    );
    expect(source).toContain(
      "function presentGpuFlowVisibleFramePresentationOutcome",
    );
    expect(source).not.toContain(
      "export function completeGpuFlowVisibleFramePresentationTransaction",
    );
    expect(source).not.toContain(
      "export function createGpuFlowVisibleFrameReducerCompletionOutcome",
    );
    expect(source).not.toContain(
      "export function selectGpuFlowVisibleFramePresentationTransaction",
    );
    expect(source).not.toContain("reducerRuntime.selectFrame({");
    expect(source).not.toContain(
      "prepareGpuFlowForcedBlockedVisibleFramePresentationCandidateSet",
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
      "projectionFrameTransaction.blockedPresentationCandidate",
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
      "projectionFrameTransaction.blockedPresentationCandidate",
    );
    expect(stateMachineReductionSource).toContain(
      "createBlockedProjectionFrame({",
    );

    expect(contentDecisionKernelSource).not.toContain('"blocked"');
    expect(contentDecisionKernelSource).not.toContain('"blocked-candidate"');
    expect(contentDecisionKernelSource).not.toContain(
      "createGpuFlowNodeLayerPreparedContentFramePresentationResult",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowPreparedContentFramePresentationFramePlan",
    );
    expect(contentDecisionKernelSource).not.toContain(
      "function selectGpuFlowContentPreparationBlockedCandidate",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowPreparedContentFramePresentationFramePlan",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowContentPreparationBlockedCandidateForFrameResult",
    );
    expect(stateMachineSource).toContain(
      "export function selectGpuFlowRetainedDisplayPresentationFramePlan",
    );
    expect(stateMachineSource).toContain('"blocked"');
    expect(stateMachineSource).toContain('"blocked-candidate"');
  });

  it("keeps transaction proof, reducer completion, and reducer decision out of the surface frame adapter", () => {
    const source = readFileSync(SURFACE_FRAME_PUBLICATION_MODULE_PATH, "utf8");

    expect(source).not.toContain(
      "createGpuFlowVisibleFramePresentationTransactionProof(",
    );
    expect(source).not.toContain(
      "proveGpuFlowVisibleFramePresentationCandidateSet",
    );
    expect(source).not.toContain("proveGpuFlowVisibleFramePresentationProof");
    expect(source).not.toContain(
      "completeGpuFlowVisibleFramePresentationTransaction",
    );
    expect(source).not.toContain(
      "selectGpuFlowVisibleFramePresentationTransaction",
    );
    expect(source).not.toContain("selectProjectionFrameTransaction");
    expect(source).not.toContain("selectRetainedProjectionReducerDecision");
    expect(source).not.toContain(
      "selectContentPreparationBlockedCandidateForFrameResult",
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
    expect(surfaceSource).toContain("presentationFrameContext");
  });

  it("keeps visible outcome token minting in the coordinator", () => {
    const coordinatorSource = readFileSync(COORDINATOR_MODULE_PATH, "utf8");
    const authoritySource = readFileSync(TOKEN_AUTHORITY_MODULE_PATH, "utf8");
    const presentationProofSource = readFileSync(AUTHORITY_MODULE_PATH, "utf8");
    const completionSource = readFileSync(COMPLETION_MODULE_PATH, "utf8");
    const rawTokenConstructors = [
      "createGpuFlowBlockedPresentationToken",
      "createGpuFlowVisibleFramePresentationToken",
      "createGpuFlowHoldPreviousToken",
      "createGpuFlowPresentableFrame",
    ] as const;

    expect(authoritySource).toContain(
      "createGpuFlowVisibleFramePresentationTokenIssuer",
    );
    expect(authoritySource).not.toContain(
      "export function createGpuFlowVisibleFramePresentationTokenIssuer",
    );
    expect(authoritySource).toContain(
      "visibleFramePresentationTokenIssuer.createPresentationToken",
    );
    expect(authoritySource).toContain(
      "visibleFramePresentationTokenIssuer.createBlockedPresentationToken",
    );
    expect(authoritySource).toContain(
      "visibleFramePresentationTokenIssuer.createHoldPreviousToken",
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
      "function createGpuFlowVisibleFrameBlockedPresentationTokenForProof",
    );
    expect(authoritySource).not.toContain(
      "export function createGpuFlowVisibleFrameBlockedPresentationTokenForProof",
    );
    expect(authoritySource).toContain(
      "export function createGpuFlowVisibleFrameReducerCompletionPresentationToken",
    );
    expect(authoritySource).not.toContain(
      "visibleFramePresentationBlockedProofToken",
    );
  });

  it("keeps reducer debt frame requests private to presentation completion", () => {
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
      "function scheduleDelayedGpuFlowReducerDebtFrame",
    );
    expect(debtRequestsSource).not.toContain(
      "export function scheduleDelayedGpuFlowReducerDebtFrame",
    );
    expect(completionSource).not.toContain("flowSurfaceReducerDebtFrame");
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
