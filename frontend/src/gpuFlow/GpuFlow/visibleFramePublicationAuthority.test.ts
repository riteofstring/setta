import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const modulePath = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));
const GPU_FLOW_ROOT = modulePath("../");
const TOKEN_MODULE_PATH = modulePath("./visibleFramePublicationTokens.ts");
const AUTHORITY_MODULE_PATH = modulePath(
  "./visibleFramePublicationAuthority.ts",
);
const KERNEL_MODULE_PATH = modulePath("./visibleFramePublicationKernel.ts");
const KERNEL_CANDIDATE_ORACLE_MODULE_PATH = modulePath(
  "./visibleFramePublicationCandidateOracle.ts",
);
const KERNEL_PRESENTATION_MODULE_PATH = modulePath(
  "./visibleFramePublicationKernelPresentation.ts",
);
const CONTENT_PLAN_MODULE_PATH = modulePath(
  "./visibleFramePublicationContentPlan.ts",
);
const KERNEL_COMPLETION_MODULE_PATH = modulePath(
  "./visibleFramePublicationCompletion.ts",
);
const CHROME_REPRO_MODULE_PATH = modulePath(
  "./flowVisiblePublicationOutcomeChromeRepro.ts",
);
const BROWSER_VISUAL_RUNTIME_MODULE_PATH = modulePath(
  "./browserVisualActorRuntime.ts",
);
const DOM_CONTROL_PLANE_MODULE_PATH = modulePath("./domControlPlane.tsx");
const DOM_ISLAND_LAYER_MODULE_PATH = modulePath("./domIslandLayer.tsx");
const RETAINED_DOM_CONTROL_SNAPSHOT_SOURCES_MODULE_PATH = modulePath(
  "./retainedDomControlSnapshotSources.tsx",
);
const SURFACE_TEXTURE_RELEASE_AUTHORITY_MODULE_PATH = modulePath(
  "../surfaceTextureReleaseAuthority.ts",
);
const COMMITTED_SURFACE_PUBLICATION_MODULE_PATH = modulePath(
  "./flowCommittedSurfacePublication.ts",
);
const COMMITTED_SURFACE_PUBLICATION_CANDIDATE_HANDLING_MODULE_PATH = modulePath(
  "./flowCommittedSurfacePublicationCandidateHandling.ts",
);
const COMMITTED_SURFACE_RUNTIME_MODULE_PATH = modulePath(
  "../committedSurfaceRuntime.ts",
);
const PROJECTION_FRAME_MODULE_PATH = modulePath("./flowProjectionFrame.tsx");
const FLOW_FRAME_MODULE_PATH = modulePath("./flowFrame.tsx");
const SURFACE_FRAME_PUBLICATION_MODULE_PATH = modulePath(
  "./flowSurfaceFramePublication.ts",
);
const SURFACE_PUBLICATION_COMPLETION_MODULE_PATH = modulePath(
  "./flowSurfacePublicationCompletion.ts",
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
  "createGpuFlowVisibleFrameBlockedPublicationTokenForProof",
  "createGpuFlowVisibleFrameCommitPublicationToken",
  "createGpuFlowVisibleFrameHoldPreviousToken",
] as const;
const PRODUCTION_SCHEDULER_TRANSACTION_CALLERS = new Set([
  "GpuFlow/visibleFramePublicationAuthority.ts",
  "GpuFlow/visibleFramePublicationKernel.ts",
]);
const PRODUCTION_COMMITTED_CONTENT_STORE_MUTATORS = new Set([
  "committedSurfaceRuntime.ts",
  "GpuFlow/committedSurfaceFrameState.ts",
]);
const PRODUCTION_OVERLAY_TRANSFORM_CALLERS = new Set([
  "GpuFlow/flowSurfacePublicationCompletion.ts",
]);
const PRODUCTION_BROWSER_VISUAL_CURRENT_PROJECTION_CALLERS = new Set([
  "GpuFlow/committedSurfaceFrameState.ts",
]);
const PRODUCTION_PROJECTION_DEBUG_ATTRIBUTE_CALLERS = new Set([
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
  "GpuFlow/flowSurfacePublicationCompletion.ts",
]);
const PRODUCTION_VISIBLE_PROJECTION_STATE_PUBLISHERS = new Set([
  "GpuFlow/flowSurfacePublicationCompletion.ts",
]);
const PRODUCTION_PREPARED_COMMITTED_SURFACE_FRAME_COMMITTERS = new Set([
  "GpuFlow/flowSurfacePublicationCompletion.ts",
]);

describe("GPU Flow visible publication authority boundaries", () => {
  it("keeps raw publication token constructors out of the public token module", () => {
    const tokenModuleSource = readFileSync(TOKEN_MODULE_PATH, "utf8");
    const authoritySource = readFileSync(AUTHORITY_MODULE_PATH, "utf8");

    for (const constructorName of TOKEN_CONSTRUCTOR_NAMES) {
      expect(tokenModuleSource).not.toContain(constructorName);
      expect(authoritySource).not.toContain(
        `export function ${constructorName}`,
      );
    }
    expect(authoritySource).toContain(
      "function createGpuFlowVisiblePublicationTokenIssuer",
    );
    expect(authoritySource).not.toContain(
      "export function createGpuFlowVisiblePublicationTokenIssuer",
    );
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
      return [
        `${relativePath} imports raw publication token constructors ${[
          ...new Set(importedConstructors),
        ].join(", ")}`,
      ];
    });
    expect(violations).toEqual([]);
  });

  it("keeps direct visible publication proof helpers out of production callers", () => {
    const forbiddenImports: readonly {
      readonly moduleName: string;
      readonly names: readonly string[];
    }[] = [
      {
        moduleName: "visibleFramePublicationKernel",
        names: DIRECT_VISIBLE_TOKEN_MINT_HELPER_NAMES,
      },
      {
        moduleName: "visibleFramePublicationOracle",
        names: [
          "createGpuFlowVisiblePublicationCommitDebtProof",
          "createGpuFlowVisiblePublicationCommitOracleFactory",
        ],
      },
    ];
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath) || filePath === KERNEL_MODULE_PATH) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      const importedHelpers = forbiddenImports.flatMap(
        ({ moduleName, names }) =>
          extractNamedImports({ moduleName, source }).flatMap((bindings) =>
            names
              .filter((helperName) => bindings.includes(helperName))
              .map((helperName) => `${moduleName}:${helperName}`),
          ),
      );
      if (importedHelpers.length === 0) {
        return [];
      }
      return [
        `${relativeGpuFlowPath(filePath)} imports direct visible publication proof helpers ${[
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
        !/\b(?:visiblePublicationSchedulerRef\.current|scheduler)\.(?:selectFrame|completeFrame|recordUncommittedFrame)\s*\(/.test(
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
        `${relativePath} selects, completes, or observes visible publication scheduler debt outside the transaction kernel`,
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

  it("keeps committed-surface held-previous transaction assembly inside the kernel", () => {
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
      "createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction({",
    );
    expect(kernelSource).toContain(
      "decideGpuFlowCommittedSurfacePublicationTransaction",
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
    expect(kernelSource).not.toContain(
      "export function decideGpuFlowRetainedProjectionPublicationTransaction",
    );
    expect(kernelSource).not.toContain(
      "export function selectGpuFlowProjectionFrameTransactionFromPublicationDecision",
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
      "createGpuFlowVisibleFramePublicationTransactionOracleFactory",
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
    const candidateSource = readCommittedSurfaceAuthorityCandidateSource();
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
    expect(candidateHandlingSource).not.toContain(
      "export function resolveGpuFlowCommittedSurfacePublicationCandidateAction",
    );
    expect(kernelSource).not.toContain(
      "createGpuFlowCommittedSurfacePublicationCandidateActionResolver",
    );
    expect(kernelSource).not.toContain(
      "createGpuFlowCommittedSurfacePublicationActionFrameResultResolver",
    );
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
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const candidateSource = readCommittedSurfaceAuthorityCandidateSource();
    const effectApplierStart = committedSurfaceSource.indexOf(
      "export function applyGpuFlowCommittedSurfacePublicationEffect",
    );

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
      "runRetainedCommittedSurfacePublicationContentStage",
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
    expect(source).not.toContain("notifyRetainedDisplayFollowUpFrameNeeded");
    expect(surfaceFrameSource).not.toContain(
      "resolveGpuFlowRetainedDisplayPublicationOutcomeFrame",
    );
    expect(surfaceFrameSource).not.toContain(
      "notifyRetainedDisplayFollowUpFrameNeeded",
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
      "selectGpuFlowRetainedDisplayFollowUpFrameReason",
    );
    expect(kernelSource).not.toContain(
      "createGpuFlowRetainedDisplayOutcomeFrameResultResolver",
    );
    expect(kernelSource).not.toContain(
      "createGpuFlowNodeLayerFrameRetainedProjectionBlockedResult",
    );
    expect(kernelSource).toContain(
      "selectGpuFlowContentPublicationBlockedCandidate",
    );
    expect(kernelSource).not.toContain(
      "export function createGpuFlowContentPublicationBlockedCandidateSelector",
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
    expect(flowFrameSource).not.toContain(
      "onRetainedDisplayFollowUpFrameNeeded",
    );
    expect(flowFrameSource).not.toContain("retainedDisplayFollowUpFrameReason");
    expect(completionStart).toBeGreaterThanOrEqual(0);
    expect(completionSource).not.toContain(
      "retainedDisplayFollowUpFrameReason",
    );
    expect(completionSource).toContain(
      "requestGpuFlowSurfacePublicationFollowUpFrames",
    );
    expect(completionSource).toContain("followUpFrameRequests");
  });

  it("keeps held-previous committed-surface candidates tokenless until completion", () => {
    const committedSurfaceSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const candidateSource = readCommittedSurfaceAuthorityCandidateSource();
    const candidateHandlingSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_CANDIDATE_HANDLING_MODULE_PATH,
      "utf8",
    );
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const effectApplierStart = committedSurfaceSource.indexOf(
      "export function applyGpuFlowCommittedSurfacePublicationEffect",
    );

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

  it("keeps React semantic committed-surface observers downstream of publication", () => {
    const committedSurfaceRuntimeSource = readFileSync(
      COMMITTED_SURFACE_RUNTIME_MODULE_PATH,
      "utf8",
    );
    const publishMethodStart = committedSurfaceRuntimeSource.indexOf(
      [
        "  publishCommittedContentFrame(",
        "    token: GpuFlowCommitPublicationToken,",
        "    frame: GpuFlowCommittedContentFrame,",
        "  ): boolean {",
      ].join("\n"),
    );
    const resetMethodStart = committedSurfaceRuntimeSource.indexOf(
      "  resetCommittedContentFrame(token: GpuFlowCommittedSurfaceResetToken): void {",
    );
    const startupMethodStart = committedSurfaceRuntimeSource.indexOf(
      [
        "  setStartupFrame(",
        "    token: GpuFlowCommittedSurfaceStartupToken,",
        "    frame: GpuFlowCommittedContentFrame,",
        "  ): void {",
      ].join("\n"),
    );
    const scheduleMethodStart = committedSurfaceRuntimeSource.indexOf(
      "private scheduleReactSemanticEmit",
    );
    const emitSemanticMethodStart = committedSurfaceRuntimeSource.indexOf(
      "private emitReactSemanticSnapshot",
    );
    const publishMethodSource = committedSurfaceRuntimeSource.slice(
      publishMethodStart,
      resetMethodStart,
    );
    const resetMethodSource = committedSurfaceRuntimeSource.slice(
      resetMethodStart,
      startupMethodStart,
    );
    const scheduleMethodSource = committedSurfaceRuntimeSource.slice(
      scheduleMethodStart,
      emitSemanticMethodStart,
    );

    expect(publishMethodStart).toBeGreaterThanOrEqual(0);
    expect(resetMethodStart).toBeGreaterThan(publishMethodStart);
    expect(startupMethodStart).toBeGreaterThan(resetMethodStart);
    expect(scheduleMethodStart).toBeGreaterThan(startupMethodStart);
    expect(emitSemanticMethodStart).toBeGreaterThan(scheduleMethodStart);
    expect(publishMethodSource).toContain("this.emitCommittedFrame()");
    expect(publishMethodSource).toContain("this.scheduleReactSemanticEmit()");
    expect(
      publishMethodSource.indexOf("this.emitCommittedFrame()"),
    ).toBeLessThan(
      publishMethodSource.indexOf("this.scheduleReactSemanticEmit()"),
    );
    expect(publishMethodSource).not.toContain(
      "this.emitReactSemanticSnapshot()",
    );
    expect(resetMethodSource).toContain("this.scheduleReactSemanticEmit()");
    expect(resetMethodSource).not.toContain("this.emitReactSemanticSnapshot()");
    expect(scheduleMethodSource).toContain("queueMicrotask");
    expect(scheduleMethodSource).toContain("reactSemanticEmitQueued");
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
    const lifecycleSource = readFileSync(
      modulePath("./flowFrameLifecycle.ts"),
      "utf8",
    );
    const surfaceFrameSource = readSurfaceFramePublicationAuthoritySource();
    const nodeLayerPublisherStart = lifecycleSource.indexOf(
      "export function publishGpuFlowNodeLayerFrameState",
    );
    const nodeLayerPublisherSource = lifecycleSource.slice(
      nodeLayerPublisherStart,
    );

    expect(flowFrameSource).not.toContain("updateGpuFlowNodeLayerFrameState");
    expect(flowFrameSource).not.toContain("onNodeLayerFrameStatePublishable");
    expect(flowFrameSource).toContain("nodeLayerFrameStatePublication");
    expect(projectionFrameSource).not.toContain(
      "updateGpuFlowNodeLayerFrameState",
    );
    expect(projectionFrameSource).not.toContain(
      "onNodeLayerFrameStatePublishable",
    );
    expect(projectionFrameSource).toContain("nodeLayerFrameStatePublication");
    expect(nodeLayerPublisherStart).toBeGreaterThanOrEqual(0);
    expect(lifecycleSource).not.toContain(
      "export function updateGpuFlowNodeLayerFrameState",
    );
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
    ).toBe(0);
    expect(surfaceFrameSource).toContain("publishGpuFlowNodeLayerFrameState({");
  });

  it("defers canvas submission until commit-tokened node-layer publication", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const projectionFrameSource = readFileSync(
      PROJECTION_FRAME_MODULE_PATH,
      "utf8",
    );
    const lifecycleSource = readFileSync(
      modulePath("./flowFrameLifecycle.ts"),
      "utf8",
    );
    const submitterStart = lifecycleSource.indexOf(
      "function submitGpuFlowHtmlSurfaceCanvasFrame",
    );
    const submitterSource = lifecycleSource.slice(submitterStart);

    expect(flowFrameSource).toContain('canvasSubmissionMode: "deferred"');
    expect(projectionFrameSource).toContain('canvasSubmissionMode: "deferred"');
    expect(submitterStart).toBeGreaterThanOrEqual(0);
    expect(submitterSource).toContain(
      "assertGpuFlowCommitPublicationTokenBrand",
    );
    expect(submitterSource).toContain("canvasSubmission.submit()");
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
    const retainedSnapshotSource = readFileSync(
      RETAINED_DOM_CONTROL_SNAPSHOT_SOURCES_MODULE_PATH,
      "utf8",
    );
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

  it("realizes browser visual hosts before notifying React store observers", () => {
    const browserVisualRuntimeSource = readFileSync(
      BROWSER_VISUAL_RUNTIME_MODULE_PATH,
      "utf8",
    );
    const domControlSource = readFileSync(
      DOM_CONTROL_PLANE_MODULE_PATH,
      "utf8",
    );
    const domIslandSource = readFileSync(DOM_ISLAND_LAYER_MODULE_PATH, "utf8");
    const retainedSnapshotSource = readFileSync(
      RETAINED_DOM_CONTROL_SNAPSHOT_SOURCES_MODULE_PATH,
      "utf8",
    );
    const commitMethodStart = browserVisualRuntimeSource.indexOf(
      "commitPreparedBrowserVisualActors",
    );
    const abortMethodStart = browserVisualRuntimeSource.indexOf(
      "abortPreparedBrowserVisualActors",
    );
    const commitMethodSource = browserVisualRuntimeSource.slice(
      commitMethodStart,
      abortMethodStart,
    );

    expect(commitMethodStart).toBeGreaterThanOrEqual(0);
    expect(abortMethodStart).toBeGreaterThan(commitMethodStart);
    expect(commitMethodSource).toContain(
      "this.publishBrowserVisualHostPresentation",
    );
    expect(commitMethodSource).not.toContain("this.emitPreparation()");
    expect(browserVisualRuntimeSource).not.toContain("subscribePreparation");
    expect(browserVisualRuntimeSource).not.toContain("preparationListeners");
    expect(domControlSource).not.toContain("subscribePreparation");
    expect(domIslandSource).not.toContain("subscribePreparation");
    expect(retainedSnapshotSource).not.toContain("subscribePreparation");
    expect(
      commitMethodSource.indexOf("this.publishBrowserVisualHostPresentation"),
    ).toBeLessThan(commitMethodSource.indexOf("this.scheduleSnapshotEmit()"));
    expect(commitMethodSource).not.toContain("this.emitSnapshot()");
    expect(browserVisualRuntimeSource).toContain(
      "assertGpuFlowCommitPublicationTokenForFrameId",
    );
    const scheduleMethodStart = browserVisualRuntimeSource.indexOf(
      "private scheduleSnapshotEmit",
    );
    const emitMethodStart = browserVisualRuntimeSource.indexOf(
      "private emitSnapshot",
    );
    const scheduleMethodSource = browserVisualRuntimeSource.slice(
      scheduleMethodStart,
      emitMethodStart,
    );
    expect(scheduleMethodStart).toBeGreaterThan(commitMethodStart);
    expect(emitMethodStart).toBeGreaterThan(scheduleMethodStart);
    expect(scheduleMethodSource).toContain("queueMicrotask");
    expect(scheduleMethodSource).toContain("snapshotEmitQueued");
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
    expect(publicationCallCount).toBe(2);
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
    const contentFrameSource = source.slice(contentFrameStart, contentFrameEnd);
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

    expect(flowSurfaceSource).not.toContain(
      "publicationResult.coldStartShellFrame",
    );
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
    expect(completionPublisherSource).toContain("coldStartShellPublication");
    expect(completionPublisherSource).toContain(
      "publishColdStartShellFrame(coldStartShellPublication)",
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
    KERNEL_CANDIDATE_ORACLE_MODULE_PATH,
    KERNEL_PRESENTATION_MODULE_PATH,
    KERNEL_COMPLETION_MODULE_PATH,
    CONTENT_PLAN_MODULE_PATH,
    modulePath("./visibleFramePublicationOracle.ts"),
  ]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}

function readCommittedSurfaceAuthorityCandidateSource(): string {
  const source = readFileSync(KERNEL_CANDIDATE_ORACLE_MODULE_PATH, "utf8");
  const candidateStart = source.indexOf(
    "function prepareGpuFlowCommittedSurfacePublicationCandidate",
  );
  expect(candidateStart).toBeGreaterThanOrEqual(0);
  return source.slice(candidateStart);
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
