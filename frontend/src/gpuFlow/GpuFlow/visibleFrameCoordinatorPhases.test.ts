import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const COORDINATOR_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameCoordinator.ts", import.meta.url),
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
  new URL("./visibleFramePresenter.ts", import.meta.url),
);
const SURFACE_PUBLICATION_DEBT_REQUESTS_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresenterDebtRequests.ts", import.meta.url),
);
const SURFACE_PUBLICATION_DEBT_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfacePublicationDebtFrame.ts", import.meta.url),
);

describe("GPU Flow visible frame coordinator phases", () => {
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
      "reduceGpuFlowVisibleFramePublicationDecision({",
      "createGpuFlowVisibleFramePublicationFrameContext({",
      "prepareGpuFlowVisibleFramePublicationCandidateSet({",
      "createGpuFlowVisibleFramePublicationPreparedFrame({",
      "proveGpuFlowVisibleFramePublicationPresentation(",
    ]);
    expect(reducerSource).not.toContain(
      "prepareVisibleFrameResourcesForBudget?.",
    );
    expectOrderedPhases(publishSource, [
      "publish(transaction);",
      "prepareVisibleFrameResourcesForBudget?.(",
    ]);
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
      "visiblePublicationTokenIssuer.createCommitPublicationToken",
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
    expect(source).not.toContain("scheduler.selectFrame({");
  });

  it("keeps transaction proof, scheduler completion, and publication decision out of the surface frame adapter", () => {
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
    expect(source).not.toContain("selectRetainedProjectionPublicationDecision");
    expect(source).not.toContain(
      "selectContentPublicationBlockedCandidateForFrameResult",
    );
    expect(source).not.toContain(
      "visiblePublicationSchedulerRef.current.getKnobs",
    );
    expect(source).not.toMatch(
      /\.(?:selectFrame|completeFrame|recordUncommittedFrame)\s*\(/,
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
      "createGpuFlowCommitPublicationToken",
      "createGpuFlowHoldPreviousToken",
      "createGpuFlowPresentableCommit",
    ] as const;

    expect(authoritySource).toContain(
      "createGpuFlowVisiblePublicationTokenIssuer",
    );
    expect(authoritySource).not.toContain(
      "export function createGpuFlowVisiblePublicationTokenIssuer",
    );
    expect(authoritySource).toContain(
      "visiblePublicationTokenIssuer.createCommitPublicationToken",
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
    expect(presentationProofSource).toContain(
      "commitAuthorityProof: commitProof.commitAuthorityProof",
    );
    expect(presentationProofSource).toContain(
      "function createGpuFlowVisibleFrameBlockedPublicationTokenForProof",
    );
    expect(authoritySource).not.toContain(
      "export function createGpuFlowVisibleFrameBlockedPublicationTokenForProof",
    );
    expect(authoritySource).toContain(
      "export function createGpuFlowVisiblePublicationCompletionCommitToken",
    );
    expect(authoritySource).not.toContain(
      "visibleFramePublicationBlockedProofToken",
    );
  });

  it("keeps scheduler debt frame requests private to publication completion", () => {
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
