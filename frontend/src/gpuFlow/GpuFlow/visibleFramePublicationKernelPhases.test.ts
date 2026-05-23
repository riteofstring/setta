import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationKernel.ts", import.meta.url),
);
const AUTHORITY_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresentationProofs.ts", import.meta.url),
);
const COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameOutcomeReport.ts", import.meta.url),
);
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfaceFramePublication.ts", import.meta.url),
);
const SURFACE_PUBLICATION_COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresenter.ts", import.meta.url),
);
const SURFACE_PUBLICATION_DEBT_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfacePublicationDebtFrame.ts", import.meta.url),
);

describe("GPU Flow visible publication kernel phases", () => {
  it("runs sample, prepare, prove, decide, completion, and publish through the visible frame engine lifecycle", () => {
    const source = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const authoritySource = readFileSync(AUTHORITY_MODULE_PATH, "utf8");
    const runStart = source.indexOf(
      "export function runGpuFlowVisibleFramePublicationCandidateSetKernel",
    );
    const firstHelperStart = source.indexOf(
      "function assertGpuFlowVisibleFrameKernelEngineOutcomeMatchesTransaction",
    );
    const runSource = source.slice(runStart, firstHelperStart);

    expect(runStart).toBeGreaterThanOrEqual(0);
    expect(firstHelperStart).toBeGreaterThan(runStart);
    expectOrderedPhases(runSource, [
      "createGpuFlowVisibleFrameEngine({",
      "sampleVisibleFrame: () => {",
      "sampleGpuFlowVisibleFramePublicationTransaction({",
      "prepareVisibleFrameCandidate: () => {",
      "selectGpuFlowVisibleFramePublicationTransaction({",
      "prepareGpuFlowVisibleFramePublicationCandidateSet({",
      "proveGpuFlowVisibleFramePublicationCandidateSet({",
      "decideGpuFlowVisibleFramePublicationOutcome({",
      "presentVisibleFrame: ({ outcome })",
      "holdVisibleFrame: ({ outcome })",
      "blockColdStartVisibleFrame: ({ outcome })",
      "abortVisibleFrameCandidate: ({ outcome })",
      "engine.runFrame();",
    ]);
    expect(runSource).toContain(
      "proveGpuFlowVisibleFramePublicationPresentation({",
    );
    expect(runSource).toContain(
      "publishGpuFlowVisibleFramePublicationOutcome({",
    );
    expect(source).toContain(
      "function sampleGpuFlowVisibleFramePublicationTransaction",
    );
    expect(source).toContain(
      "function prepareGpuFlowVisibleFramePublicationCandidateSet",
    );
    expect(source).toContain(
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
      /export\s*\{[\s\S]*createGpuFlowVisibleFramePublicationTransactionOracleFactory[\s\S]*\}\s+from "\.\/visibleFrameTransactionProofs"/,
    );
    expect(source).toContain(
      "function decideGpuFlowVisibleFramePublicationOutcome",
    );
    expect(source).toContain(
      'from "./visibleFramePresentationProofs"',
    );
    expect(authoritySource).toContain(
      "export function proveGpuFlowVisibleFramePublicationPresentation",
    );
    expect(authoritySource).toContain(
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
  });

  it("keeps transaction proof, scheduler completion, and publication decision out of the surface frame adapter", () => {
    const source = readFileSync(SURFACE_FRAME_PUBLICATION_MODULE_PATH, "utf8");

    expect(source).not.toContain(
      "createGpuFlowVisibleFramePublicationTransactionOracle(",
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

  it("keeps frame-context deferral decisions private to the transaction kernel", () => {
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const surfaceSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );

    expect(kernelSource).toContain(
      "function shouldDeferGpuFlowResolutionUpdates",
    );
    expect(kernelSource).not.toContain(
      "export function shouldDeferGpuFlowResolutionUpdates",
    );
    expect(surfaceSource).not.toContain("shouldDeferGpuFlowResolutionUpdates");
    expect(surfaceSource).toContain("publicationFrameContext");
  });

  it("keeps visible outcome token minting in the kernel", () => {
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const authoritySource = readFileSync(AUTHORITY_MODULE_PATH, "utf8");
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
      expect(kernelSource).not.toContain(constructorName);
      expect(completionSource).not.toContain(constructorName);
      expect(authoritySource).toContain(`function ${constructorName}`);
      expect(authoritySource).not.toContain(
        `export function ${constructorName}`,
      );
    }
    expect(authoritySource).toContain(
      "commitAuthorityProof: commitOracle.commitAuthorityProof",
    );
    expect(authoritySource).toContain(
      "function createGpuFlowVisibleFrameBlockedPublicationTokenForProof",
    );
    expect(authoritySource).not.toContain(
      "export function createGpuFlowVisibleFrameBlockedPublicationToken",
    );
    expect(authoritySource).not.toContain(
      "export function createGpuFlowVisibleFrameHoldPreviousToken",
    );
    expect(authoritySource).not.toContain(
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

    expect(existsSync(SURFACE_PUBLICATION_DEBT_FRAME_MODULE_PATH)).toBe(false);
    expect(completionSource).toContain(
      "function scheduleDelayedGpuFlowPublicationDebtFrame",
    );
    expect(completionSource).not.toContain(
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
