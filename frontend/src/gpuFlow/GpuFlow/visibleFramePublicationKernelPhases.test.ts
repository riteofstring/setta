import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationKernel.ts", import.meta.url),
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
      "presentableCommit: transactionOracle.presentableCommit",
    );
    expect(source).toContain(
      "function decideGpuFlowVisibleFramePublicationOutcome",
    );
    expect(source).toContain(
      "function publishGpuFlowVisibleFramePublicationOutcome",
    );
    expect(source).not.toContain(
      "export function selectGpuFlowVisibleFramePublicationTransaction",
    );
  });

  it("keeps transaction proof, scheduler completion, and publication decision out of the surface frame adapter", () => {
    const source = readFileSync(SURFACE_FRAME_PUBLICATION_MODULE_PATH, "utf8");

    expect(source).not.toContain(
      "createGpuFlowVisibleFramePublicationTransactionOracle",
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
