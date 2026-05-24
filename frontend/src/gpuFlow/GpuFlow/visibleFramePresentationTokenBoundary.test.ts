import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const modulePath = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));
const GPU_FLOW_ROOT = modulePath("../");
const AUTHORITY_MODULE_PATH = modulePath("./visibleFramePresentationTokens.ts");
const COMMIT_PROOF_MODULE_PATH = modulePath("./visibleFrameCommitProofs.ts");
const KERNEL_MODULE_PATH = modulePath("./visibleFrameCoordinator.ts");
const CHROME_REPRO_MODULE_PATH = modulePath(
  "./visibleFrameOutcomeChromeRepro.ts",
);
const TOKEN_CONSTRUCTOR_NAMES = [
  "createGpuFlowBlockedPublicationToken",
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
  "GpuFlow/visibleFramePresentationProofs.ts",
  "GpuFlow/visibleFrameCoordinator.ts",
]);

describe("GPU Flow visible frame presentation token boundaries", () => {
  it("keeps raw publication token constructors private to the presentation proof authority", () => {
    const authoritySource = readFileSync(AUTHORITY_MODULE_PATH, "utf8");

    for (const constructorName of TOKEN_CONSTRUCTOR_NAMES) {
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
          /import\s+(?:type\s+)?\{(?<bindings>[^}]*)\}\s+from\s+["'][^"']*visibleFramePresentationProofs["']/g,
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
        )} from visibleFramePresentationProofs`,
      ];
    });
    expect(violations).toEqual([]);
  });

  it("keeps raw token constructor imports isolated to the transaction coordinator", () => {
    const violations = listSourceFiles(GPU_FLOW_ROOT).flatMap((filePath) => {
      if (
        filePath === AUTHORITY_MODULE_PATH ||
        filePath === KERNEL_MODULE_PATH
      ) {
        return [];
      }
      const source = readFileSync(filePath, "utf8");
      const importedConstructors = extractNamedImports({
        moduleName: "visibleFramePresentationProofs",
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
        moduleName: "visibleFrameCoordinator",
        names: DIRECT_VISIBLE_TOKEN_MINT_HELPER_NAMES,
      },
      {
        moduleName: "visibleFrameTransactionProofs",
        names: [
          "createGpuFlowVisiblePublicationCommitDebtProof",
          "createGpuFlowVisiblePublicationCommitProofFactory",
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

  it("keeps visible publication scheduler selection and completion inside the transaction coordinator", () => {
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
        `${relativePath} selects, completes, or observes visible publication scheduler debt outside the transaction coordinator`,
      ];
    });

    expect(violations).toEqual([]);
  });

  it("keeps visible publication transaction report assembly inside the transaction coordinator", () => {
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
    const source = readFileSync(COMMIT_PROOF_MODULE_PATH, "utf8");
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
