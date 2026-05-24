import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const modulePath = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));
const GPU_FLOW_ROOT = modulePath("../");

// Removal milestone: docs/plans/gpu-flow-coherent-visible-frame-engine-plan.md step 3.
const REMOVED_VISIBLE_PUBLICATION_AUTHORITY_MODULES = [
  "./browserVisualFaultInjectionPublication",
  "./flowCommittedSurfacePublication",
  "./flowColdStartShellFramePublication",
  "./flowSurfaceFramePublication",
  "./flowSurfacePublicationCompletion",
  "./flowVisiblePublicationBlockedGuard",
  "./flowVisiblePublicationOutcomeChromeRepro",
  "./flowVisiblePublicationOutcomeGuard",
  "./visibleFramePublicationAuthority",
  "./visibleFramePublicationActorOracle",
  "./visibleFramePublicationBlockedCandidate",
  "./visibleFramePublicationOracle",
  "./visibleFramePublicationCandidateOracle",
  "./visibleFramePublicationCompletion",
  "./visibleFramePublicationContentAbort",
  "./visibleFramePublicationContentPlan",
  "./visibleFramePublicationContentPreparation",
  "./visibleFramePublicationForcedBlockedCandidateSet",
  "./visibleFramePublicationKernel",
  "./visibleFramePublicationKernelPresentation",
  "./visibleFramePublicationKernelProjectionCoverage",
  "./visibleFramePublicationKernelProjectionWorkTypes",
  "./visibleFramePublicationKernelWorkPlan",
  "./visibleFrameEngine",
  "./visibleFrameKernel",
  "./visibleFramePublicationPresentationEvidence",
  "./visibleFramePublicationProjectionPlan",
  "./visibleFramePublicationResourceOracle",
  "./visibleFramePublicationTestUtils",
  "./visibleFramePublicationTokens",
  "./visibleFrameResourceRegistry",
] as const;

describe("GPU Flow visible frame architecture", () => {
  it("keeps removed visible-publication authority paths out of production", () => {
    const existingRemovedFiles =
      REMOVED_VISIBLE_PUBLICATION_AUTHORITY_MODULES.map(
        (moduleName) => `${moduleName}.ts`,
      ).filter((path) => existsSync(modulePath(path)));

    const productionImportViolations = listSourceFiles(GPU_FLOW_ROOT).flatMap(
      (filePath) => {
        if (isTestSourceFile(filePath)) {
          return [];
        }
        const source = readFileSync(filePath, "utf8");
        const importedRemovedModules =
          REMOVED_VISIBLE_PUBLICATION_AUTHORITY_MODULES.filter(
            (moduleName) =>
              source.includes(`from "${moduleName}"`) ||
              source.includes(`from "${moduleName}.ts"`) ||
              source.includes(`from '${moduleName}'`) ||
              source.includes(`from '${moduleName}.ts'`),
          );
        if (importedRemovedModules.length === 0) {
          return [];
        }
        return [
          `${relativeGpuFlowPath(filePath)} imports ${importedRemovedModules.join(
            ", ",
          )}`,
        ];
      },
    );

    expect(existingRemovedFiles).toEqual([]);
    expect(productionImportViolations).toEqual([]);
  });
});

function listSourceFiles(root: string): readonly string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return listSourceFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function isTestSourceFile(filePath: string): boolean {
  return /(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx)$/.test(filePath);
}

function relativeGpuFlowPath(filePath: string): string {
  return relative(GPU_FLOW_ROOT, filePath);
}
