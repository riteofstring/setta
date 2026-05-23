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
const TOKEN_CONSTRUCTOR_NAMES = [
  "createGpuFlowBlockedPublicationToken",
  "createGpuFlowCommittedSurfaceResetToken",
  "createGpuFlowCommittedSurfaceStartupToken",
  "createGpuFlowCommitPublicationToken",
  "createGpuFlowHoldPreviousToken",
] as const;
const PRODUCTION_TOKEN_CONSTRUCTOR_IMPORTERS = new Set([
  "GpuFlow/committedSurfaceFrameState.ts",
  "GpuFlow/flowCommittedSurfacePublication.ts",
  "GpuFlow/flowProjectionFrame.tsx",
  "GpuFlow/flowSurfaceFramePublication.ts",
]);
const PRODUCTION_SCHEDULER_COMPLETION_CALLERS = new Set([
  "GpuFlow/flowSurfaceFramePublication.ts",
]);
const PRODUCTION_COMMITTED_CONTENT_STORE_MUTATORS = new Set([
  "committedSurfaceRuntime.ts",
  "GpuFlow/committedSurfaceFrameState.ts",
]);
const PRODUCTION_OVERLAY_TRANSFORM_CALLERS = new Set([
  "GpuFlow/flowSurfaceFramePublication.ts",
]);
const PRODUCTION_BROWSER_VISUAL_CURRENT_PROJECTION_CALLERS = new Set<string>();
const PRODUCTION_PROJECTION_DEBUG_ATTRIBUTE_CALLERS = new Set([
  "GpuFlow/flowCommittedSurfacePublication.ts",
  "GpuFlow/flowCommittedSurfacePublicationGateHandling.ts",
  "GpuFlow/flowFrame.tsx",
  "GpuFlow/flowProjectionFrame.tsx",
]);
const PRODUCTION_SURFACE_TEXTURE_RELEASE_CALLERS = new Set([
  "htmlSurfaces/textures.ts",
  "surfaceTextureReleaseAuthority.ts",
]);
const PRODUCTION_VISIBLE_PROJECTION_STATE_MUTATORS = new Set([
  "GpuFlow/flowSurface.tsx",
  "GpuFlow/flowVisibleProjectionStatePublication.ts",
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

  it("keeps raw token constructors out of non-publication production modules", () => {
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (filePath === AUTHORITY_MODULE_PATH || isTestSourceFile(filePath)) {
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

  it("keeps visible publication scheduler completion inside the publication executor", () => {
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (
        !/\bvisiblePublicationSchedulerRef\.current\.completeFrame\s*\(/.test(
          source,
        )
      ) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (PRODUCTION_SCHEDULER_COMPLETION_CALLERS.has(relativePath)) {
        return [];
      }
      return [
        `${relativePath} completes visible publication scheduler debt outside the publication executor`,
      ];
    });

    expect(violations).toEqual([]);
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

    expect(violations).toEqual([]);
  });

  it("keeps current browser visual projection out of React layer effects", () => {
    const currentProjectionPattern =
      /\.(?:projectDomControls|projectDomIslands)\s*\(\s*\)/;
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      if (!currentProjectionPattern.test(source)) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      if (
        PRODUCTION_BROWSER_VISUAL_CURRENT_PROJECTION_CALLERS.has(relativePath)
      ) {
        return [];
      }
      return [
        `${relativePath} projects browser visual actors against the current viewport outside the publication path`,
      ];
    });

    expect(violations).toEqual([]);
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
