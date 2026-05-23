import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const GPU_FLOW_ROOT = fileURLToPath(new URL("../", import.meta.url));
const TOKEN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationTokens.ts", import.meta.url),
);
const AUTHORITY_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationAuthority.ts", import.meta.url),
);
const KERNEL_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationKernel.ts", import.meta.url),
);
const KERNEL_CANDIDATES_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationCandidates.ts", import.meta.url),
);
const KERNEL_COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationCompletion.ts", import.meta.url),
);
const CHROME_REPRO_MODULE_PATH = fileURLToPath(
  new URL("./flowVisiblePublicationOutcomeChromeRepro.ts", import.meta.url),
);
const BROWSER_VISUAL_RUNTIME_MODULE_PATH = fileURLToPath(
  new URL("./browserVisualActorRuntime.ts", import.meta.url),
);
const DOM_CONTROL_PLANE_MODULE_PATH = fileURLToPath(
  new URL("./domControlPlane.tsx", import.meta.url),
);
const DOM_ISLAND_LAYER_MODULE_PATH = fileURLToPath(
  new URL("./domIslandLayer.tsx", import.meta.url),
);
const SURFACE_TEXTURE_RELEASE_AUTHORITY_MODULE_PATH = fileURLToPath(
  new URL("../surfaceTextureReleaseAuthority.ts", import.meta.url),
);
const COMMITTED_SURFACE_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./flowCommittedSurfacePublication.ts", import.meta.url),
);
const COMMITTED_SURFACE_PUBLICATION_CANDIDATE_HANDLING_MODULE_PATH =
  fileURLToPath(
    new URL(
      "./flowCommittedSurfacePublicationCandidateHandling.ts",
      import.meta.url,
    ),
  );
const PROJECTION_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowProjectionFrame.tsx", import.meta.url),
);
const FLOW_FRAME_MODULE_PATH = fileURLToPath(
  new URL("./flowFrame.tsx", import.meta.url),
);
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfaceFramePublication.ts", import.meta.url),
);
const SURFACE_PUBLICATION_COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfacePublicationCompletion.ts", import.meta.url),
);
const TOKEN_CONSTRUCTOR_NAMES = [
  "createGpuFlowBlockedPublicationToken",
  "createGpuFlowCommittedSurfaceResetToken",
  "createGpuFlowCommittedSurfaceStartupToken",
  "createGpuFlowCommitPublicationToken",
  "createGpuFlowHoldPreviousToken",
  "createGpuFlowPresentableCommit",
] as const;
const DIRECT_VISIBLE_TOKEN_MINT_HELPER_NAMES = [
  "createGpuFlowVisibleFrameBlockedPublicationToken",
  "createGpuFlowVisibleFrameBlockedPublicationTokenForCandidate",
  "createGpuFlowVisibleFrameCommitPublicationToken",
  "createGpuFlowVisibleFrameHoldPreviousToken",
] as const;
const PRODUCTION_TOKEN_CONSTRUCTOR_IMPORTERS = new Set([
  "GpuFlow/visibleFramePublicationKernel.ts",
  "GpuFlow/visibleFramePublicationCompletion.ts",
]);
const PRODUCTION_SCHEDULER_TRANSACTION_CALLERS = new Set([
  "GpuFlow/visibleFramePublicationKernel.ts",
  "GpuFlow/visibleFramePublicationCompletion.ts",
]);
const PRODUCTION_COMMITTED_CONTENT_STORE_MUTATORS = new Set([
  "committedSurfaceRuntime.ts",
  "GpuFlow/committedSurfaceFrameState.ts",
]);
const PRODUCTION_OVERLAY_TRANSFORM_CALLERS = new Set([
  "GpuFlow/flowSurfaceFramePublication.ts",
  "GpuFlow/flowSurfacePublicationCompletion.ts",
]);
const PRODUCTION_BROWSER_VISUAL_CURRENT_PROJECTION_CALLERS = new Set([
  "GpuFlow/committedSurfaceFrameState.ts",
]);
const PRODUCTION_PROJECTION_DEBUG_ATTRIBUTE_CALLERS = new Set([
  "GpuFlow/flowSurfaceFramePublication.ts",
  "GpuFlow/flowSurfacePublicationCompletion.ts",
]);
const PRODUCTION_SURFACE_TEXTURE_RELEASE_CALLERS = new Set([
  "htmlSurfaces/textures.ts",
  "surfaceTextureReleaseAuthority.ts",
]);
const PRODUCTION_RAW_SURFACE_TEXTURE_RELEASE_CALLERS = new Set([
  "surfaceTextureReleaseAuthority.ts",
]);
const PRODUCTION_VISIBLE_PROJECTION_STATE_MUTATORS = new Set([
  "GpuFlow/flowSurface.tsx",
  "GpuFlow/flowVisibleProjectionStatePublication.ts",
]);
const PRODUCTION_VISIBLE_PROJECTION_STATE_PUBLISHERS = new Set([
  "GpuFlow/flowSurfaceFramePublication.ts",
  "GpuFlow/flowSurfacePublicationCompletion.ts",
]);
const PRODUCTION_PREPARED_COMMITTED_SURFACE_FRAME_COMMITTERS = new Set([
  "GpuFlow/flowSurfaceFramePublication.ts",
  "GpuFlow/flowSurfacePublicationCompletion.ts",
]);

describe("GPU Flow visible publication authority boundaries", () => {
  it("keeps raw publication token constructors out of the public token module", () => {
    const tokenModuleSource = readFileSync(TOKEN_MODULE_PATH, "utf8");

    for (const constructorName of TOKEN_CONSTRUCTOR_NAMES) {
      expect(tokenModuleSource).not.toContain(constructorName);
    }
  });

  it("imports raw token constructors only from the publication authority module", () => {
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (filePath === AUTHORITY_MODULE_PATH) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      const tokenImports = [
        ...source.matchAll(
          /import\s+(?:type\s+)?\{(?<bindings>[^}]*)\}\s+from\s+["'][^"']*visibleFramePublicationTokens["']/g,
        ),
      ];
      const importedConstructors = tokenImports.flatMap((match) => {
        const bindings = match.groups?.bindings ?? "";
        return TOKEN_CONSTRUCTOR_NAMES.filter((constructorName) =>
          bindings.includes(constructorName),
        );
      });
      if (importedConstructors.length === 0) {
        return [];
      }
      return [
        `${relative(GPU_FLOW_ROOT, filePath)} imports ${importedConstructors.join(
          ", ",
        )} from visibleFramePublicationTokens`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("keeps raw token constructor imports isolated to the transaction kernel", () => {
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (
        filePath === AUTHORITY_MODULE_PATH ||
        filePath === KERNEL_MODULE_PATH
      ) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      const importedConstructors = extractNamedImports({
        moduleName: "visibleFramePublicationAuthority",
        source,
      }).flatMap((bindings) =>
        TOKEN_CONSTRUCTOR_NAMES.filter((constructorName) =>
          bindings.includes(constructorName),
        ),
      );
      if (importedConstructors.length === 0) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (PRODUCTION_TOKEN_CONSTRUCTOR_IMPORTERS.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} imports raw publication token constructors ${[
          ...new Set(importedConstructors),
        ].join(", ")}`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("keeps direct visible publication token mint helpers out of production callers", () => {
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath) || filePath === KERNEL_MODULE_PATH) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      const importedHelpers = extractNamedImports({
        moduleName: "visibleFramePublicationKernel",
        source,
      }).flatMap((bindings) =>
        DIRECT_VISIBLE_TOKEN_MINT_HELPER_NAMES.filter((helperName) =>
          bindings.includes(helperName),
        ),
      );
      if (importedHelpers.length === 0) {
        return [];
      }
      return [
        `${relativeGpuFlowPath(filePath)} imports direct visible token mint helpers ${[
          ...new Set(importedHelpers),
        ].join(", ")}`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("keeps visible publication scheduler selection and completion inside the transaction kernel", () => {
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (
        !/\b(?:visiblePublicationSchedulerRef\.current|scheduler)\.(?:selectFrame|completeFrame)\s*\(/.test(
          source,
        )
      ) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (PRODUCTION_SCHEDULER_TRANSACTION_CALLERS.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} selects or completes visible publication scheduler debt outside the transaction kernel`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("keeps visible publication transaction report assembly inside the transaction kernel", () => {
    const source = readFileSync(CHROME_REPRO_MODULE_PATH, "utf8");
    const forbiddenReportAssembly = [
      {
        label: "actor generation traversal",
        pattern: /\bactorGenerations\b/,
      },
      {
        label: "browser visual proof traversal",
        pattern: /\bbrowserVisual\??\.proof\b/,
      },
      {
        label: "compatible previous proof traversal",
        pattern: /\bcompatiblePreviousProof\b/,
      },
      {
        label: "presentable commit digest assembly",
        pattern:
          /\b(?:expectedActorSetDigest|presentationPairDigest|proofDigest)\b/,
      },
      {
        label: "surface coverage proof traversal",
        pattern: /\b(?:coverageProof|surfaceTransaction)\b/,
      },
      {
        label: "text coverage proof traversal",
        pattern: /\btextCoverageProof\b/,
      },
    ] as const;

    expect(source).toContain(
      "createGpuFlowVisiblePublicationTransactionReport",
    );
    expect(
      forbiddenReportAssembly.flatMap(({ label, pattern }) =>
        pattern.test(source) ? [label] : [],
      ),
    ).toEqual([]);
  });

  it("binds commit presentation digests to actor manifests and browser visual resources", () => {
    const source = readFileSync(AUTHORITY_MODULE_PATH, "utf8");
    const digestStart = source.indexOf(
      "function createGpuFlowPresentationPairDigest",
    );
    const digestSource = source.slice(digestStart);

    expect(digestStart).toBeGreaterThanOrEqual(0);
    expect(digestSource).toContain("createGpuFlowActorManifestDigest(frame)");
    expect(digestSource).toContain("createGpuFlowVisibleProofDigest(frame)");
    expect(digestSource).toContain(
      "createGpuFlowPresentationProofDigest(frame)",
    );
    expect(digestSource).toContain("frame.presentationProof.canvasGeneration");
    expect(digestSource).toContain("frame.presentationProof.domGeneration");
    expect(digestSource).toContain(
      "frame.presentationProof.actorManifestDigest",
    );
    expect(digestSource).toContain(
      "frame.presentationProof.browserVisualFragmentDigest",
    );
    expect(digestSource).toContain(
      "frame.presentationProof.surfaceTransactionDigest",
    );
  });

  it("keeps committed-surface held-previous transaction assembly inside the transaction kernel", () => {
    const committedSurfaceSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const kernelSource = readVisibleFramePublicationKernelAuthoritySource();

    expect(committedSurfaceSource).not.toContain(
      "createGpuFlowVisibleProjectionStateForRetainedPublication",
    );
    expect(committedSurfaceSource).not.toContain(
      "createGpuFlowVisibleFrameHoldPreviousTokenForProjectionState",
    );
    expect(committedSurfaceSource).not.toContain(
      "createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction",
    );
    expect(kernelSource).toContain(
      "createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction",
    );
  });

  it("keeps projection frames from minting publication tokens before completion", () => {
    const source = readFileSync(PROJECTION_FRAME_MODULE_PATH, "utf8");
    const kernelSource = readVisibleFramePublicationKernelAuthoritySource();
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );

    expect(source).not.toMatch(
      /\bcreateGpuFlow(?:ProjectionFrameDebugPublicationToken|RetainedProjectionBlockedPublicationToken|VisibleFrameBlockedPublicationToken|VisibleFrameCommitPublicationToken|VisibleFrameHoldPreviousToken)\b/,
    );
    expect(kernelSource).not.toContain(
      "createGpuFlowProjectionFrameDebugPublicationToken",
    );
    expect(kernelSource).not.toContain(
      "createGpuFlowVisibleFrameHoldPreviousTokenForProjectionState",
    );
    expect(kernelSource).not.toContain("commitPublicationToken");
    expect(source).not.toContain("createGpuFlowHeldPreviousProjection");
    expect(source).not.toContain(
      "createGpuFlowProjectionTransactionForCommittedFrameId",
    );
    expect(source).not.toContain(
      "decideGpuFlowRetainedProjectionPublicationTransaction",
    );
    expect(source).not.toContain(
      "resolveGpuFlowProjectionFrameTransactionFromPublicationDecision",
    );
    expect(surfaceFrameSource).not.toContain(
      "decideGpuFlowRetainedProjectionPublicationTransaction",
    );
    expect(surfaceFrameSource).not.toContain(
      "resolveGpuFlowProjectionFrameTransactionFromPublicationDecision",
    );
    expect(kernelSource).toContain(
      "decideGpuFlowRetainedProjectionPublicationTransaction",
    );
    expect(kernelSource).toContain(
      "selectGpuFlowProjectionFrameTransactionFromPublicationDecision",
    );
    expect(kernelSource).toContain("createGpuFlowHeldPreviousProjection");
    expect(source).not.toContain("holdPreviousToken");
  });

  it("keeps motion projection blocked repair scheduling inside the kernel", () => {
    const source = readFileSync(PROJECTION_FRAME_MODULE_PATH, "utf8");
    const kernelSource = readVisibleFramePublicationKernelAuthoritySource();
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();

    expect(source).not.toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
    expect(source).not.toContain("blockedProjectionReason");
    expect(surfaceFrameSource).not.toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
    expect(surfaceFrameSource).toContain(
      "runGpuFlowVisibleFramePublicationCandidateSetKernel",
    );
    expect(kernelSource).toContain(
      "createGpuFlowVisibleFramePublicationTransactionOracle",
    );
    expect(kernelSource).toContain("blockedSource");
    expect(kernelSource).toContain("visibleProjectionSource");
    expect(kernelSource).toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
  });

  it("keeps committed-surface publication candidates tokenless until completion", () => {
    const committedSurfaceSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const candidateHandlingSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_CANDIDATE_HANDLING_MODULE_PATH,
      "utf8",
    );
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const kernelSource = readVisibleFramePublicationKernelAuthoritySource();
    const kernelModuleSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const publishBranchStart = kernelSource.indexOf(
      'if (transactionDecision.kind === "publish")',
    );
    const publishBranchEnd = kernelSource.indexOf(
      "if (!publishedCommittedSurfaceFrame)",
      publishBranchStart,
    );
    const publishBranchSource = kernelSource.slice(
      publishBranchStart,
      publishBranchEnd,
    );
    const effectApplierStart = committedSurfaceSource.indexOf(
      "export function applyGpuFlowCommittedSurfacePublicationEffect",
    );
    const candidateStart = kernelModuleSource.indexOf(
      "export function prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    const candidateSource = kernelModuleSource.slice(candidateStart);

    expect(committedSurfaceSource).not.toContain(
      "export function prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    expect(flowFrameSource).not.toContain(
      "prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    expect(flowFrameSource).not.toContain(
      "flowCommittedSurfacePublicationCandidateHandling",
    );
    expect(flowFrameSource).not.toContain(
      "resolveGpuFlowCommittedSurfacePublicationCandidateAction",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowNodeLayerCommittedSurfacePublicationResult",
    );
    expect(flowFrameSource).not.toContain(
      "createGpuFlowNodeLayerFrameResultForVisibleProjectionState",
    );
    expect(flowFrameSource).not.toContain(
      "committedSurfacePublicationCandidateAction.kind",
    );
    expect(flowFrameSource).not.toContain("onBlockedSurfacePublication");
    expect(flowFrameSource).not.toContain("onCommittedSurfaceFramePublishable");
    expect(flowFrameSource).not.toContain(
      "onPreparedCommittedSurfaceFrameHeld",
    );
    expect(surfaceFrameSource).not.toContain(
      "prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    expect(surfaceFrameSource).not.toContain(
      "resolveGpuFlowCommittedSurfacePublicationCandidateAction",
    );
    expect(kernelSource).toContain(
      "createGpuFlowCommittedSurfacePublicationCandidateActionResolver",
    );
    expect(kernelSource).toContain(
      "resolveGpuFlowCommittedSurfacePublicationActionFrameResult",
    );
    expect(candidateStart).toBeGreaterThanOrEqual(0);
    expect(effectApplierStart).toBeGreaterThanOrEqual(0);
    expect(candidateSource).not.toMatch(/\bGpuFlowCommitPublicationToken\b/);
    expect(publishBranchStart).toBeGreaterThanOrEqual(0);
    expect(publishBranchEnd).toBeGreaterThan(publishBranchStart);
    expect(publishBranchSource).not.toContain("token");
    expect(candidateHandlingSource).not.toContain(
      "GpuFlowCommitPublicationToken",
    );
    expect(candidateHandlingSource).not.toMatch(
      /onCommittedSurfaceFramePublishable\?\.\([\s\S]{0,80}token/,
    );
  });

  it("keeps committed-surface repair effects behind visible publication completion", () => {
    const committedSurfaceSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const kernelModuleSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const candidateStart = kernelModuleSource.indexOf(
      "export function prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    const effectApplierStart = committedSurfaceSource.indexOf(
      "export function applyGpuFlowCommittedSurfacePublicationEffect",
    );
    const candidateSource = kernelModuleSource.slice(candidateStart);

    expect(candidateStart).toBeGreaterThanOrEqual(0);
    expect(effectApplierStart).toBeGreaterThanOrEqual(0);
    expect(candidateSource).not.toContain(
      "requestGpuFlowBrowserVisualRetryFrame",
    );
    expect(candidateSource).not.toContain(
      "recordGpuFlowBrowserVisualStarvation",
    );
    expect(candidateSource).not.toContain(
      "clearGpuFlowBrowserVisualStarvationDebt",
    );
    expect(surfaceFrameSource).toContain(
      "applyGpuFlowCommittedSurfacePublicationEffect",
    );
    expect(surfaceFrameSource).toContain("token: outcome.token");
  });

  it("reports retained cold-start coverage blocks as kernel candidates", () => {
    const source = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const kernelSource = readVisibleFramePublicationKernelAuthoritySource();
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const branchStart = source.indexOf(
      "prepareRetainedDisplayPublicationFramePlan",
    );

    expect(branchStart).toBeGreaterThanOrEqual(0);
    expect(source).not.toContain("block-cold-first-coverage");
    expect(source).not.toContain(
      'retainedDisplayOutcomeFrame.kind === "blocked"',
    );
    expect(source).not.toMatch(/\bresolveGpuFlowRetainedDisplayPublication\(/);
    expect(source).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(source).not.toContain(
      "notifyGpuFlowRetainedDisplayFollowUpFrameNeeded",
    );
    expect(surfaceFrameSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(source).not.toContain("onRetainedProjectionPublicationBlocked");
    expect(surfaceFrameSource).not.toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
    expect(surfaceFrameSource).not.toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidate",
    );
    expect(surfaceFrameSource).not.toContain("retainedProjectionBlockedReason");
    expect(kernelSource).not.toContain("retainedProjectionBlockedReason");
    expect(surfaceFrameSource).not.toContain(
      "prepareGpuFlowRetainedDisplayPublicationCandidate",
    );
    expect(source).not.toContain("selectRetainedDisplayPublicationFramePlan");
    expect(source).not.toContain("selectCommittedSurfacePublicationFramePlan");
    expect(kernelSource).toContain(
      "prepareGpuFlowRetainedDisplayPublicationCandidate",
    );
    expect(kernelSource).toContain(
      "createGpuFlowRetainedDisplayPublicationFramePlanPreparer",
    );
    expect(kernelSource).toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(kernelSource).toContain(
      "createGpuFlowRetainedDisplayFollowUpFrameNotifier",
    );
    expect(kernelSource).toContain(
      "notifyGpuFlowRetainedDisplayFollowUpFrameNeeded",
    );
    expect(kernelSource).toContain(
      "resolveGpuFlowRetainedDisplayOutcomeFrameResult",
    );
    expect(kernelSource).not.toContain(
      "createGpuFlowNodeLayerFrameRetainedProjectionBlockedResult",
    );
    expect(kernelSource).toContain(
      "createGpuFlowContentPublicationBlockedCandidateSelector",
    );
    expect(kernelSource).toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
    expect(kernelSource).toContain(
      "createGpuFlowBrowserVisualBlockedPublicationCandidate",
    );
  });

  it("keeps retained display repair scheduling behind visible publication completion", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const completionStart = surfaceFrameSource.indexOf(
      "function completeGpuFlowSurfacePublicationFrame",
    );
    const completionSource = surfaceFrameSource.slice(completionStart);

    expect(flowFrameSource).not.toContain(
      'surfaceRef.current?.requestFrame("texture-upload")',
    );
    expect(flowFrameSource).toContain("onRetainedDisplayFollowUpFrameNeeded");
    expect(completionStart).toBeGreaterThanOrEqual(0);
    expect(completionSource).toContain("retainedDisplayFollowUpFrameReason");
    expect(completionSource).toContain(
      "surfaceRef.current?.requestFrame(retainedDisplayFollowUpFrameReason)",
    );
  });

  it("keeps held-previous committed-surface candidates tokenless until completion", () => {
    const committedSurfaceSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const kernelModuleSource = readFileSync(KERNEL_MODULE_PATH, "utf8");
    const candidateHandlingSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_CANDIDATE_HANDLING_MODULE_PATH,
      "utf8",
    );
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const effectApplierStart = committedSurfaceSource.indexOf(
      "export function applyGpuFlowCommittedSurfacePublicationEffect",
    );
    const candidateStart = kernelModuleSource.indexOf(
      "export function prepareGpuFlowCommittedSurfacePublicationCandidate",
    );
    const candidateSource = kernelModuleSource.slice(candidateStart);

    expect(candidateStart).toBeGreaterThanOrEqual(0);
    expect(effectApplierStart).toBeGreaterThanOrEqual(0);
    expect(candidateSource).not.toContain("GpuFlowHoldPreviousToken");
    expect(candidateSource).not.toMatch(
      /\btoken:\s*GpuFlowHoldPreviousToken\b/,
    );
    expect(candidateHandlingSource).not.toContain("GpuFlowHoldPreviousToken");
    expect(candidateHandlingSource).not.toMatch(
      /onPreparedCommittedSurfaceFrameHeld\?\.\([\s\S]{0,80}token/,
    );
    expect(surfaceFrameSource).not.toContain(
      "selectGpuFlowVisiblePublicationTokens",
    );
    expect(surfaceFrameSource).not.toContain(
      "selectGpuFlowVisibleHoldPreviousToken",
    );
    expect(surfaceFrameSource).not.toMatch(/\blet\s+holdPreviousToken\b/);
    expect(surfaceFrameSource).not.toMatch(/\breadonly\s+holdPreviousToken\b/);
  });

  it("keeps committed content store mutation inside committed-surface publication state", () => {
    const mutatorPattern =
      /\b(?:publishCommittedContentFrame|resetCommittedContentFrame|setStartupFrame)\s*\(/;
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (!mutatorPattern.test(source)) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (PRODUCTION_COMMITTED_CONTENT_STORE_MUTATORS.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} mutates the committed content frame store outside the committed-surface publication bridge`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("applies viewport overlay transforms only from visible publication completion", () => {
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (!/\.applyOverlayTransforms\s*\(/.test(source)) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (PRODUCTION_OVERLAY_TRANSFORM_CALLERS.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} applies viewport overlay transforms outside visible publication completion`,
      ];
    });
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const overlayPublisherStart = surfaceFrameSource.indexOf(
      "function publishGpuFlowVisibleOverlayProjectionTransform",
    );
    const overlayPublisherSource = surfaceFrameSource.slice(
      overlayPublisherStart,
    );

    expect(violations).toEqual([]);
    expect(overlayPublisherStart).toBeGreaterThanOrEqual(0);
    expect(
      [...surfaceFrameSource.matchAll(/\.applyOverlayTransforms\s*\(/g)].length,
    ).toBe(1);
    expect(overlayPublisherSource).toContain(
      "assertGpuFlowCommitPublicationTokenBrand",
    );
    expect(overlayPublisherSource).toContain(".applyOverlayTransforms(");
  });

  it("publishes node-layer frame state only from visible publication completion", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const projectionFrameSource = readFileSync(
      PROJECTION_FRAME_MODULE_PATH,
      "utf8",
    );
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const nodeLayerPublisherStart = surfaceFrameSource.indexOf(
      "function publishGpuFlowNodeLayerFrameState",
    );
    const nodeLayerPublisherSource = surfaceFrameSource.slice(
      nodeLayerPublisherStart,
    );

    expect(flowFrameSource).not.toContain("updateGpuFlowNodeLayerFrameState");
    expect(flowFrameSource).toContain("onNodeLayerFrameStatePublishable");
    expect(projectionFrameSource).not.toContain(
      "updateGpuFlowNodeLayerFrameState",
    );
    expect(projectionFrameSource).toContain("onNodeLayerFrameStatePublishable");
    expect(nodeLayerPublisherStart).toBeGreaterThanOrEqual(0);
    expect(nodeLayerPublisherSource).toContain(
      "assertGpuFlowCommitPublicationTokenBrand",
    );
    expect(nodeLayerPublisherSource).toContain(
      "readonly token: GpuFlowCommitPublicationToken",
    );
    expect(
      [
        ...surfaceFrameSource.matchAll(
          /\bupdateGpuFlowNodeLayerFrameState\s*\(/g,
        ),
      ].length,
    ).toBe(1);
    expect(nodeLayerPublisherSource).toContain(
      "updateGpuFlowNodeLayerFrameState(",
    );
  });

  it("keeps browser visual projection on tokenized publication paths", () => {
    const currentProjectionPattern =
      /\.(?:projectDomControls|projectDomIslands)\s*\((?<args>[^)]*)\)/g;
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      const matches = [...source.matchAll(currentProjectionPattern)];
      if (matches.length === 0) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (
        PRODUCTION_BROWSER_VISUAL_CURRENT_PROJECTION_CALLERS.has(
          relativePath,
        ) &&
        matches.every((match) => (match.groups?.args ?? "").includes("token"))
      ) {
        return [];
      }
      return [
        `${relativePath} projects browser visual actors without the tokenized publication path`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("keeps browser visual projection out of prepared candidate commit", () => {
    const source = readFileSync(BROWSER_VISUAL_RUNTIME_MODULE_PATH, "utf8");
    const commitMethodStart = source.indexOf(
      "commitPreparedBrowserVisualActors",
    );
    const abortMethodStart = source.indexOf("abortPreparedBrowserVisualActors");
    const commitMethodSource = source.slice(
      commitMethodStart,
      abortMethodStart,
    );

    expect(commitMethodStart).toBeGreaterThanOrEqual(0);
    expect(abortMethodStart).toBeGreaterThan(commitMethodStart);
    expect(commitMethodSource).not.toMatch(
      /\b(?:projectDomControls|projectDomIslands)\s*\(/,
    );
  });

  it("routes DOM-control host repair scheduling through the committed browser visual token", () => {
    const domControlSource = readFileSync(
      DOM_CONTROL_PLANE_MODULE_PATH,
      "utf8",
    );
    const browserVisualRuntimeSource = readFileSync(
      BROWSER_VISUAL_RUNTIME_MODULE_PATH,
      "utf8",
    );

    expect(domControlSource).not.toContain(
      'surfaceRef?.current?.requestFrame("texture-upload")',
    );
    expect(domControlSource).toContain(
      "requestCommittedBrowserVisualRepairFrame",
    );
    expect(browserVisualRuntimeSource).toContain("snapshotPublicationToken");
    expect(browserVisualRuntimeSource).toContain(
      "assertGpuFlowCommitPublicationTokenForFrameId",
    );
    expect(browserVisualRuntimeSource).toContain(
      'surface.requestFrame("texture-upload")',
    );
  });

  it("requires committed browser visual tokens for visible host registration", () => {
    const domControlSource = readFileSync(
      DOM_CONTROL_PLANE_MODULE_PATH,
      "utf8",
    );
    const domIslandSource = readFileSync(DOM_ISLAND_LAYER_MODULE_PATH, "utf8");
    const browserVisualRuntimeSource = readFileSync(
      BROWSER_VISUAL_RUNTIME_MODULE_PATH,
      "utf8",
    );

    expect(domControlSource).toContain(
      'presentation: "preparation" | "visible"',
    );
    expect(domControlSource).toContain("presentation");
    expect(domIslandSource).toContain('"visible"');
    expect(domIslandSource).toContain('"preparation"');
    expect(browserVisualRuntimeSource).toContain(
      "assertBrowserVisualHostRegistrationToken",
    );
    expect(browserVisualRuntimeSource).toContain(
      "visible browser visual host registration requires a committed publication token",
    );
  });

  it("publishes projection debug frame ids only from visible publication paths", () => {
    const debugAttributePattern =
      /\b(?:applyGpuFlowProjectionDebugAttributes|setProjectionDebugAttributes)\s*\(/;
    const projectionDebugSource = readFileSync(
      join(GPU_FLOW_ROOT, "projectionDebugAttributes.ts"),
      "utf8",
    );
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (relativePath === "projectionDebugAttributes.ts") {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (!debugAttributePattern.test(source)) {
        return [];
      }
      if (PRODUCTION_PROJECTION_DEBUG_ATTRIBUTE_CALLERS.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} publishes projection debug frame ids outside visible publication paths`,
      ];
    });

    expect(violations).toEqual([]);
    expect(projectionDebugSource).toContain(
      "readonly token: GpuFlowCommitPublicationToken",
    );
    expect(projectionDebugSource).not.toContain("GpuFlowHoldPreviousToken");
  });

  it("keeps raw surface texture release behind the release authority", () => {
    const textureReleasePattern = /\.destroySurfaceTexture\s*\(/;
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (!textureReleasePattern.test(source)) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (PRODUCTION_SURFACE_TEXTURE_RELEASE_CALLERS.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} releases HTML surface textures outside the surface texture release authority`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("keeps generic surface texture release behind the release authority", () => {
    const genericReleasePattern = /\breleaseGpuFlowSurfaceTexture\s*\(/;
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (!genericReleasePattern.test(source)) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (PRODUCTION_RAW_SURFACE_TEXTURE_RELEASE_CALLERS.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} uses generic surface texture release outside the release authority`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("keeps generic surface texture release private to the release authority", () => {
    const source = readFileSync(
      SURFACE_TEXTURE_RELEASE_AUTHORITY_MODULE_PATH,
      "utf8",
    );

    expect(source).not.toMatch(
      /\bexport\s+function\s+releaseGpuFlowSurfaceTexture\b/,
    );
  });

  it("publishes visible projection state only through the publication helper", () => {
    const visibleProjectionStatePattern =
      /visibleProjectionStateRef\.current\s*=/;
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (!visibleProjectionStatePattern.test(source)) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (PRODUCTION_VISIBLE_PROJECTION_STATE_MUTATORS.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} mutates visible projection state outside the publication helper`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("publishes visible projection state only after transaction completion", () => {
    const publicationPattern = /\bpublishGpuFlowVisibleProjectionState\s*\(/g;
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (![...source.matchAll(publicationPattern)].length) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (relativePath === "GpuFlow/flowVisibleProjectionStatePublication.ts") {
        return [];
      }
      if (PRODUCTION_VISIBLE_PROJECTION_STATE_PUBLISHERS.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} publishes visible projection state outside surface publication completion`,
      ];
    });
    const publisherSource = readSurfaceFramePublicationAuthoritySource();
    const helperIndex = publisherSource.indexOf(
      "function publishGpuFlowSurfaceVisibleProjectionState",
    );
    const publicationCallCount = [
      ...publisherSource.matchAll(publicationPattern),
    ].length;
    const helperPublicationCallCount = [
      ...publisherSource.slice(helperIndex).matchAll(publicationPattern),
    ].length;

    expect(violations).toEqual([]);
    expect(helperIndex).toBeGreaterThanOrEqual(0);
    expect(publicationCallCount).toBe(1);
    expect(helperPublicationCallCount).toBe(1);
  });

  it("commits prepared committed surface frames only from visible publication completion", () => {
    const commitPattern = /\bcommitPreparedCommittedSurfaceFrame\s*\(/g;
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (![...source.matchAll(commitPattern)].length) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (
        PRODUCTION_PREPARED_COMMITTED_SURFACE_FRAME_COMMITTERS.has(relativePath)
      ) {
        return [];
      }
      return [
        `${relativePath} commits prepared committed surface frames outside visible publication completion`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("publishes retained display frames only from visible publication completion", () => {
    const assignmentPattern = /retainedDisplayFrameRef\.current\s*=(?!=)/g;
    const productionAssignmentModules = new Set([
      "GpuFlow/flowSurface.tsx",
      "GpuFlow/flowSurfaceFramePublication.ts",
      "GpuFlow/flowSurfacePublicationCompletion.ts",
    ]);
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (![...source.matchAll(assignmentPattern)].length) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (productionAssignmentModules.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} publishes retained display frames outside visible publication completion`,
      ];
    });
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const publisherStart = surfaceFrameSource.indexOf(
      "function publishGpuFlowRetainedDisplayFrame",
    );
    const publisherSource = surfaceFrameSource.slice(publisherStart);

    expect(violations).toEqual([]);
    expect(publisherStart).toBeGreaterThanOrEqual(0);
    expect([...surfaceFrameSource.matchAll(assignmentPattern)].length).toBe(1);
    expect(publisherSource).toContain(
      "assertGpuFlowCommitPublicationTokenBrand",
    );
    expect(publisherSource).toContain(
      "readonly token: GpuFlowCommitPublicationToken",
    );
    expect(publisherSource).toContain(
      "retainedDisplayFrameRef.current = retainedDisplayFrame",
    );
  });

  it("publishes retained runtime callbacks only from visible publication completion", () => {
    const source = readSurfaceFramePublicationAuthoritySource();
    const contentFrameStart = source.indexOf(
      "function renderGpuFlowSurfaceContentPublicationFrame",
    );
    const contentFrameEnd = source.indexOf(
      "function shouldRenderGpuFlowSurfaceContentPublicationFrame",
      contentFrameStart,
    );
    const contentFrameSource = source.slice(
      contentFrameStart,
      contentFrameEnd,
    );
    const completionPublisherStart = source.indexOf(
      "function publishGpuFlowRetainedRuntimeFrame",
    );
    const completionPublisherSource = source.slice(completionPublisherStart);

    expect(contentFrameStart).toBeGreaterThanOrEqual(0);
    expect(contentFrameEnd).toBeGreaterThan(contentFrameStart);
    expect(contentFrameSource).not.toContain(
      "callbacksRef.current.onRetainedRuntimeFrame",
    );
    expect(completionPublisherStart).toBeGreaterThanOrEqual(0);
    expect(completionPublisherSource).toContain(
      "assertGpuFlowCommitPublicationTokenBrand",
    );
    expect(completionPublisherSource).toContain(
      "readonly token: GpuFlowCommitPublicationToken",
    );
    expect(completionPublisherSource).toContain(
      "callbacksRef.current.onRetainedRuntimeFrame",
    );
  });

  it("publishes cold-start shell frames only from visible publication completion", () => {
    const flowSurfaceSource =
      readFileSync(join(GPU_FLOW_ROOT, "GpuFlow/flowSurface.tsx"), "utf8") +
      readFileSync(
        join(GPU_FLOW_ROOT, "GpuFlow/flowColdStartShellFramePublication.ts"),
        "utf8",
      );
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const completionPublisherStart = surfaceFrameSource.indexOf(
      "function publishGpuFlowColdStartShellFrame",
    );
    const completionPublisherSource = surfaceFrameSource.slice(
      completionPublisherStart,
    );

    expect(flowSurfaceSource).not.toContain("publicationResult.coldStartShellFrame");
    expect(flowSurfaceSource).not.toContain("void publication.token");
    expect(flowSurfaceSource).toContain("publishColdStartShellFrame");
    expect(flowSurfaceSource).toContain(
      "assertGpuFlowColdStartShellPublicationToken",
    );
    expect(flowSurfaceSource).toContain(
      "assertGpuFlowBlockedPublicationTokenBrand",
    );
    expect(flowSurfaceSource).toContain(
      "assertGpuFlowCommitPublicationTokenBrand",
    );
    expect(flowSurfaceSource).toContain("assertGpuFlowHoldPreviousTokenBrand");
    expect(completionPublisherStart).toBeGreaterThanOrEqual(0);
    expect(completionPublisherSource).toContain("outcome.token");
    expect(completionPublisherSource).toContain(
      "outcome.token.frozenFrame.frame",
    );
  });
});

function extractNamedImports({
  moduleName,
  source,
}: {
  readonly moduleName: string;
  readonly source: string;
}): readonly string[] {
  return [
    ...source.matchAll(
      new RegExp(
        `import\\s+(?:type\\s+)?\\{(?<bindings>[^}]*)\\}\\s+from\\s+["'][^"']*${moduleName}["']`,
        "g",
      ),
    ),
  ].map((match) => match.groups?.bindings ?? "");
}

function readVisibleFramePublicationKernelAuthoritySource(): string {
  return [
    KERNEL_MODULE_PATH,
    KERNEL_CANDIDATES_MODULE_PATH,
    KERNEL_COMPLETION_MODULE_PATH,
    fileURLToPath(
      new URL("./visibleFramePublicationContentPlan.ts", import.meta.url),
    ),
    fileURLToPath(
      new URL("./visibleFramePublicationOracle.ts", import.meta.url),
    ),
  ]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

function readSurfaceFramePublicationAuthoritySource(): string {
  return [
    SURFACE_FRAME_PUBLICATION_MODULE_PATH,
    SURFACE_PUBLICATION_COMPLETION_MODULE_PATH,
  ]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

function isTestSourceFile(path: string): boolean {
  return (
    /\.(test|spec)\.[cm]?tsx?$/.test(path) || /TestUtils\.[cm]?tsx?$/.test(path)
  );
}

function listSourceFiles(root: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (/\.(test\.)?[cm]?tsx?$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

function relativeGpuFlowPath(path: string): string {
  return relative(GPU_FLOW_ROOT, path);
}
