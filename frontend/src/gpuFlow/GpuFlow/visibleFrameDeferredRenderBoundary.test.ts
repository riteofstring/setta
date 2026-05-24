import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const modulePath = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));
const GPU_FLOW_ROOT = modulePath("../");

const PRODUCTION_HTML_SURFACE_FRAME_RENDERERS = new Set([
  "GpuFlow/flowFrame.tsx",
  "GpuFlow/flowProjectionFrame.tsx",
]);

describe("GPU Flow visible frame deferred render boundary", () => {
  it("keeps production HTML surface frame renders in deferred publication mode", () => {
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath)) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      const relativePath = relativeGpuFlowPath(filePath);
      if (relativePath === "htmlSurfaces/frame.tsx") {
        return [];
      }
      const callIndex = source.indexOf("renderHtmlSurfaceFrame({");
      if (callIndex < 0) {
        return [];
      }
      const callSource = source.slice(callIndex, callIndex + 900);
      if (
        PRODUCTION_HTML_SURFACE_FRAME_RENDERERS.has(relativePath) &&
        callSource.includes('canvasSubmissionMode: "deferred"') &&
        callSource.includes('domTransformSubmissionMode: "deferred"')
      ) {
        return [];
      }
      return [
        `${relativePath} renders HTML surfaces without deferred presentation publication`,
      ];
    });

    expect(violations).toEqual([]);
  });
});

function isTestSourceFile(path: string): boolean {
  return /\.(test|spec)\.[cm]?tsx?$/.test(path);
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
    if (/\.[cm]?tsx?$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

function relativeGpuFlowPath(path: string): string {
  return relative(GPU_FLOW_ROOT, path);
}
