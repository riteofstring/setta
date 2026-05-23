import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationKernel.ts", import.meta.url),
);
const COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationCompletion.ts", import.meta.url),
);
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfaceFramePublication.ts", import.meta.url),
);

describe("GPU Flow visible publication kernel phases", () => {
  it("runs sample, prepare, prove, decide, and publish phases inside the kernel", () => {
    const source = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const runStart = source.indexOf(
      "export function runGpuFlowVisibleFramePublicationCandidateSetKernel",
    );
    const firstHelperStart = source.indexOf(
      "function sampleGpuFlowVisibleFramePublicationTransaction",
    );
    const runSource = source.slice(runStart, firstHelperStart);

    expect(runStart).toBeGreaterThanOrEqual(0);
    expect(firstHelperStart).toBeGreaterThan(runStart);
    expectOrderedPhases(runSource, [
      "sampleGpuFlowVisibleFramePublicationTransaction({",
      "selectGpuFlowVisibleFramePublicationTransaction({",
      "prepareGpuFlowVisibleFramePublicationCandidateSet({",
      "proveGpuFlowVisibleFramePublicationCandidateSet({",
      "decideGpuFlowVisibleFramePublicationOutcome({",
      "publishGpuFlowVisibleFramePublicationOutcome({",
    ]);
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
      "createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame({",
    );
    expect(source).not.toContain(
      "function createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame",
    );
    expect(source).toContain(
      "function decideGpuFlowVisibleFramePublicationOutcome",
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
    expect(source).not.toMatch(/\.(?:selectFrame|completeFrame)\s*\(/);
  });

  it("keeps visible outcome token minting in the kernel", () => {
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const completionSource = readFileSync(COMPLETION_MODULE_PATH, "utf8");
    const visibleTokenConstructors = [
      "createGpuFlowBlockedPublicationToken",
      "createGpuFlowCommitPublicationToken",
      "createGpuFlowCommittedSurfaceResetToken",
      "createGpuFlowCommittedSurfaceStartupToken",
      "createGpuFlowHoldPreviousToken",
      "createGpuFlowPresentableCommit",
    ] as const;

    for (const constructorName of visibleTokenConstructors) {
      expect(kernelSource).toContain(constructorName);
      expect(completionSource).not.toContain(constructorName);
    }
    expect(kernelSource).toContain(
      "function createGpuFlowVisibleFrameBlockedPublicationTokenForProof",
    );
    expect(kernelSource).not.toContain(
      "export function createGpuFlowVisibleFrameBlockedPublicationToken",
    );
    expect(kernelSource).not.toContain(
      "export function createGpuFlowVisibleFrameHoldPreviousToken",
    );
    expect(kernelSource).not.toContain(
      "export function createGpuFlowVisiblePublicationCompletionCommitToken",
    );
    expect(kernelSource).not.toContain(
      "visibleFramePublicationBlockedProofToken",
    );
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
