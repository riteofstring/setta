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
const COMMITTED_SURFACE_PUBLICATION_GATE_HANDLING_MODULE_PATH = fileURLToPath(
  new URL("./flowCommittedSurfacePublicationGateHandling.ts", import.meta.url),
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
]);
const PRODUCTION_SCHEDULER_TRANSACTION_CALLERS = new Set([
  "GpuFlow/visibleFramePublicationKernel.ts",
]);
const PRODUCTION_COMMITTED_CONTENT_STORE_MUTATORS = new Set([
  "committedSurfaceRuntime.ts",
  "GpuFlow/committedSurfaceFrameState.ts",
]);
const PRODUCTION_OVERLAY_TRANSFORM_CALLERS = new Set([
  "GpuFlow/flowSurfaceFramePublication.ts",
]);
const PRODUCTION_BROWSER_VISUAL_CURRENT_PROJECTION_CALLERS = new Set([
  "GpuFlow/committedSurfaceFrameState.ts",
]);
const PRODUCTION_PROJECTION_DEBUG_ATTRIBUTE_CALLERS = new Set([
  "GpuFlow/flowSurfaceFramePublication.ts",
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
]);
const PRODUCTION_PREPARED_COMMITTED_SURFACE_FRAME_COMMITTERS = new Set([
  "GpuFlow/flowSurfaceFramePublication.ts",
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
    const source = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_MODULE_PATH,
      "utf8",
    );

    expect(source).not.toContain(
      "createGpuFlowVisibleProjectionStateForRetainedPublication",
    );
    expect(source).not.toContain(
      "createGpuFlowVisibleFrameHoldPreviousTokenForProjectionState",
    );
    expect(source).toContain(
      "createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction",
    );
  });

  it("keeps projection frames from minting publication tokens before completion", () => {
    const source = readFileSync(PROJECTION_FRAME_MODULE_PATH, "utf8");
    const kernelSource = readFileSync(KERNEL_MODULE_PATH, "utf8");

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
    expect(source).not.toContain("holdPreviousToken");
  });

  it("keeps projection blocked repair scheduling out of the adapter", () => {
    const source = readFileSync(PROJECTION_FRAME_MODULE_PATH, "utf8");
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );

    expect(source).not.toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
    expect(source).toContain("blockedProjectionReason");
    expect(surfaceFrameSource).toContain(
      "createGpuFlowMotionProjectionBlockedPublicationCandidate",
    );
    expect(surfaceFrameSource).toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
  });

  it("keeps committed-surface publish gates tokenless until completion", () => {
    const committedSurfaceSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const gateHandlingSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_GATE_HANDLING_MODULE_PATH,
      "utf8",
    );
    const publishBranchStart = committedSurfaceSource.indexOf(
      'if (transactionDecision.kind === "publish")',
    );
    const publishBranchEnd = committedSurfaceSource.indexOf(
      "if (!publishedCommittedSurfaceFrame)",
      publishBranchStart,
    );
    const publishBranchSource = committedSurfaceSource.slice(
      publishBranchStart,
      publishBranchEnd,
    );
    const effectApplierStart = committedSurfaceSource.indexOf(
      "export function applyGpuFlowCommittedSurfacePublicationGateEffect",
    );
    const gateStart = committedSurfaceSource.indexOf(
      "export function resolveGpuFlowCommittedSurfacePublicationGate",
    );
    const gateSource = committedSurfaceSource.slice(
      gateStart,
      effectApplierStart,
    );

    expect(gateStart).toBeGreaterThanOrEqual(0);
    expect(effectApplierStart).toBeGreaterThanOrEqual(0);
    expect(gateSource).not.toMatch(/\bGpuFlowCommitPublicationToken\b/);
    expect(publishBranchStart).toBeGreaterThanOrEqual(0);
    expect(publishBranchEnd).toBeGreaterThan(publishBranchStart);
    expect(publishBranchSource).not.toContain("token");
    expect(gateHandlingSource).not.toContain("GpuFlowCommitPublicationToken");
    expect(gateHandlingSource).not.toMatch(
      /onCommittedSurfaceFramePublishable\?\.\([\s\S]{0,80}token/,
    );
  });

  it("keeps committed-surface gate repair effects behind visible publication completion", () => {
    const committedSurfaceSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const gateStart = committedSurfaceSource.indexOf(
      "export function resolveGpuFlowCommittedSurfacePublicationGate",
    );
    const effectApplierStart = committedSurfaceSource.indexOf(
      "export function applyGpuFlowCommittedSurfacePublicationGateEffect",
    );
    const gateSource = committedSurfaceSource.slice(
      gateStart,
      effectApplierStart,
    );

    expect(gateStart).toBeGreaterThanOrEqual(0);
    expect(effectApplierStart).toBeGreaterThan(gateStart);
    expect(gateSource).not.toContain("requestGpuFlowBrowserVisualRetryFrame");
    expect(gateSource).not.toContain("recordGpuFlowBrowserVisualStarvation");
    expect(gateSource).not.toContain("clearGpuFlowBrowserVisualStarvationDebt");
    expect(surfaceFrameSource).toContain(
      "applyGpuFlowCommittedSurfacePublicationGateEffect",
    );
    expect(surfaceFrameSource).toContain("token: outcome.token");
  });

  it("reports retained cold-start coverage blocks as kernel candidates", () => {
    const source = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const branchStart = source.indexOf(
      'if (retainedDisplayOutcome.kind === "block-cold-first-coverage")',
    );
    const branchEnd = source.indexOf(
      "shouldRequestGpuFlowRetainedDisplayFollowUpFrame",
      branchStart,
    );
    const branchSource = source.slice(branchStart, branchEnd);

    expect(branchStart).toBeGreaterThanOrEqual(0);
    expect(branchEnd).toBeGreaterThan(branchStart);
    expect(branchSource).toContain("onRetainedProjectionPublicationBlocked");
    expect(branchSource).not.toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
    expect(branchSource).not.toContain("requestFrame");
    expect(surfaceFrameSource).toContain(
      "createGpuFlowRetainedProjectionBlockedPublicationCandidate",
    );
  });

  it("keeps retained display repair scheduling behind visible publication completion", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
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

  it("keeps held-previous committed-surface gates tokenless until completion", () => {
    const committedSurfaceSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const gateHandlingSource = readFileSync(
      COMMITTED_SURFACE_PUBLICATION_GATE_HANDLING_MODULE_PATH,
      "utf8",
    );
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const effectApplierStart = committedSurfaceSource.indexOf(
      "export function applyGpuFlowCommittedSurfacePublicationGateEffect",
    );
    const gateStart = committedSurfaceSource.indexOf(
      "export function resolveGpuFlowCommittedSurfacePublicationGate",
    );
    const gateSource = committedSurfaceSource.slice(
      gateStart,
      effectApplierStart,
    );

    expect(gateStart).toBeGreaterThanOrEqual(0);
    expect(effectApplierStart).toBeGreaterThanOrEqual(0);
    expect(gateSource).not.toContain("GpuFlowHoldPreviousToken");
    expect(gateSource).not.toMatch(/\btoken:\s*GpuFlowHoldPreviousToken\b/);
    expect(gateHandlingSource).not.toContain("GpuFlowHoldPreviousToken");
    expect(gateHandlingSource).not.toMatch(
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
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
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
    expect(overlayPublisherSource).toContain(".applyOverlayTransforms(");
  });

  it("publishes node-layer frame state only from visible publication completion", () => {
    const flowFrameSource = readFileSync(FLOW_FRAME_MODULE_PATH, "utf8");
    const projectionFrameSource = readFileSync(
      PROJECTION_FRAME_MODULE_PATH,
      "utf8",
    );
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
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
    const publisherSource = readFileSync(
      join(GPU_FLOW_ROOT, "GpuFlow/flowSurfaceFramePublication.ts"),
      "utf8",
    );
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
    expect(helperPublicationCallCount).toBe(2);
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
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const publisherStart = surfaceFrameSource.indexOf(
      "function publishGpuFlowRetainedDisplayFrame",
    );
    const publisherSource = surfaceFrameSource.slice(publisherStart);

    expect(violations).toEqual([]);
    expect(publisherStart).toBeGreaterThanOrEqual(0);
    expect([...surfaceFrameSource.matchAll(assignmentPattern)].length).toBe(1);
    expect(publisherSource).toContain(
      "retainedDisplayFrameRef.current = retainedDisplayFrame",
    );
  });

  it("publishes retained runtime callbacks only from visible publication completion", () => {
    const source = readFileSync(SURFACE_FRAME_PUBLICATION_MODULE_PATH, "utf8");
    const contentFrameStart = source.indexOf(
      "function renderGpuFlowSurfaceContentPublicationFrame",
    );
    const contentResultStart = source.indexOf(
      "function createGpuFlowContentPublicationFrameResult",
      contentFrameStart,
    );
    const contentFrameSource = source.slice(
      contentFrameStart,
      contentResultStart,
    );
    const completionPublisherStart = source.indexOf(
      "function publishGpuFlowRetainedRuntimeFrame",
    );
    const completionPublisherSource = source.slice(completionPublisherStart);

    expect(contentFrameStart).toBeGreaterThanOrEqual(0);
    expect(contentResultStart).toBeGreaterThan(contentFrameStart);
    expect(contentFrameSource).not.toContain(
      "callbacksRef.current.onRetainedRuntimeFrame",
    );
    expect(completionPublisherStart).toBeGreaterThanOrEqual(0);
    expect(completionPublisherSource).toContain(
      "callbacksRef.current.onRetainedRuntimeFrame",
    );
  });

  it("publishes cold-start shell frames only from visible publication completion", () => {
    const flowSurfaceSource = readFileSync(
      join(GPU_FLOW_ROOT, "GpuFlow/flowSurface.tsx"),
      "utf8",
    );
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const completionPublisherStart = surfaceFrameSource.indexOf(
      "function publishGpuFlowColdStartShellFrame",
    );
    const completionPublisherSource = surfaceFrameSource.slice(
      completionPublisherStart,
    );

    expect(flowSurfaceSource).not.toContain(
      "publicationResult.coldStartShellFrame",
    );
    expect(flowSurfaceSource).toContain("publishColdStartShellFrame");
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
