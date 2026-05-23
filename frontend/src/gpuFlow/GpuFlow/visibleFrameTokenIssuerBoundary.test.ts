import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const modulePath = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));
const GPU_FLOW_ROOT = modulePath("../");
const AUTHORITY_MODULE_PATH = modulePath("./visibleFramePresentationTokens.ts");

describe("GPU Flow visible publication token issuer boundary", () => {
  it("keeps the visible publication token issuer module-private", () => {
    const authoritySource = readFileSync(AUTHORITY_MODULE_PATH, "utf8");

    expect(authoritySource).toContain(
      "function createGpuFlowVisiblePublicationTokenIssuer",
    );
    expect(authoritySource).not.toContain(
      "export function createGpuFlowVisiblePublicationTokenIssuer",
    );

    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (isTestSourceFile(filePath) || filePath === AUTHORITY_MODULE_PATH) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      const importsTokenIssuer = extractNamedImports({
        moduleName: "visibleFramePresentationTokens",
        source,
      }).some((bindings) =>
        bindings.includes("createGpuFlowVisiblePublicationTokenIssuer"),
      );
      if (!importsTokenIssuer) {
        return [];
      }
      const relativePath = relativeGpuFlowPath(filePath);
      return [
        `${relativePath} imports the module-private visible publication token issuer`,
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
