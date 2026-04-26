import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "..");
const pluginFrontendRoot = resolve(
  repoRoot,
  "plugins",
  "setta-json-render-app-gen",
  "frontend",
);
const deletedHostAppSubsystemShimPaths = [
  "src/openapi/http/requestRebuild.ts",
  "src/openapi/http/result.ts",
  "src/utils/attachmentPolicy.ts",
  "src/utils/attachments.ts",
  "src/utils/bindingRuntime.ts",
  "src/utils/c_addresses.ts",
  "src/utils/deploymentPolicies.ts",
  "src/utils/dropzone.ts",
  "src/utils/endpointUtils.ts",
  "src/utils/hostnames.ts",
  "src/utils/idNameCreation.ts",
  "src/utils/launcherOrigin.ts",
  "src/utils/origin.ts",
  "src/utils/projectStateSelectors.ts",
  "src/utils/runCapabilities.ts",
  "src/utils/serverModeBoundaryPolicy.ts",
  "src/utils/serverModeCapabilities.ts",
  "src/utils/storage.ts",
  "src/utils/textBlockTypography.ts",
] as const;
const deletedHostAppSubsystemShimReferenceSnippets =
  deletedHostAppSubsystemShimPaths.flatMap((relativePath) => [
    relativePath,
    relativePath.replace(/\.ts$/, ""),
  ]);

function readPluginFrontendFile(relativePath: string): string {
  return readFileSync(resolve(pluginFrontendRoot, relativePath), "utf8");
}

function readSourceSdkFile(relativePath: string): string {
  return readFileSync(
    resolve(repoRoot, "frontend", "plugin-sdk", "app-subsystem", relativePath),
    "utf8",
  );
}

function readHostFrontendFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, "frontend", relativePath), "utf8");
}

function listRelativeFiles(root: string, relativeRoot = ""): string[] {
  return readdirSync(resolve(root, relativeRoot), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = relativeRoot
        ? `${relativeRoot}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        return listRelativeFiles(root, relativePath);
      }
      if (entry.isFile()) {
        return [relativePath];
      }
      return [];
    })
    .sort();
}

function strictDeclarationDiagnostics(filePath: string): string[] {
  const program = ts.createProgram([filePath], {
    lib: ["lib.es2020.d.ts", "lib.dom.d.ts"],
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    types: [],
  });
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const location =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : null;
    const prefix = location
      ? `${diagnostic.file?.fileName}:${location.line + 1}:${location.character + 1}`
      : "typescript";
    return `${prefix} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
  });
}

describe("app plugin frontend build boundary guardrails", () => {
  it("keeps plugin frontend package resolution inside the plugin tree", () => {
    const packageJson = JSON.parse(readPluginFrontendFile("package.json")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyEntries = Object.entries({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    });

    const nonRegistryDependencies = dependencyEntries.filter(([, version]) =>
      /^(?:file:|link:|workspace:)/.test(version),
    );

    expect(nonRegistryDependencies).toEqual([
      [
        "@setta/app-subsystem-frontend-sdk",
        "file:./vendor/app-subsystem-frontend-sdk",
      ],
    ]);
    expect(packageJson.scripts?.["prepare-sdk"]).toBe(
      "node ./scripts/materialize-vendored-app-subsystem-sdk.mjs",
    );
    expect(packageJson.scripts?.["prepare-build-deps"]).toBe(
      "pnpm run prepare-sdk && pnpm install --lockfile=false",
    );
    expect(packageJson.scripts?.build).toBe(
      "pnpm run prepare-build-deps && vite build",
    );
    expect(packageJson.scripts?.test).toBe(
      "pnpm run prepare-build-deps && vitest run --config vitest.config.mjs",
    );
    expect(packageJson.scripts?.typecheck).toBe(
      "tsc --noEmit -p tsconfig.typecheck.json",
    );
  });

  it("keeps the plugin vite config rooted in the plugin frontend directory", () => {
    const viteConfig = readPluginFrontendFile("vite.config.mjs");

    expect(viteConfig).toContain("const pluginFrontendDir");
    expect(viteConfig).toContain("root: pluginFrontendDir");
    expect(viteConfig).toContain(
      'entry: resolve(pluginFrontendDir, "src/index.ts")',
    );
    expect(viteConfig).toContain('outDir: resolve(pluginFrontendDir, "dist")');

    for (const forbiddenSnippet of [
      "repoRootDir",
      "frontend/package.json",
      "plugin-sdk/app-subsystem/src",
      "frontend/node_modules",
      "../frontend",
      "../../frontend",
      "../../../frontend",
    ]) {
      expect(viteConfig).not.toContain(forbiddenSnippet);
    }
  });

  it("keeps plugin tests from resolving host frontend aliases", () => {
    const vitestConfig = readPluginFrontendFile("vitest.config.mjs");

    for (const forbiddenSnippet of [
      "hostFrontendDir",
      "hostFrontendSrcDir",
      "plugin-sdk/app-subsystem/src",
      "components:",
      "forks:",
      "openapi:",
      "plugins: resolve",
      "state:",
      "testUtils:",
      "utils:",
    ]) {
      expect(vitestConfig).not.toContain(forbiddenSnippet);
    }
  });

  it("rejects host binary-download transport shims", () => {
    expect(
      existsSync(resolve(repoRoot, "frontend/src/utils/backendTransport.ts")),
    ).toBe(false);
    expect(
      readHostFrontendFile("src/utils/transportRouteConstants.ts"),
    ).not.toContain("buildBinaryDownloadRoute");
    expect(readSourceSdkFile("src/transportRouteConstants.ts")).toContain(
      "buildBinaryDownloadRoute",
    );
  });

  it("rejects host app-subsystem compatibility re-export shims", () => {
    for (const relativePath of deletedHostAppSubsystemShimPaths) {
      expect(existsSync(resolve(repoRoot, "frontend", relativePath))).toBe(
        false,
      );
    }

    const sdkAddresses = readSourceSdkFile("src/c_addresses.ts");
    expect(sdkAddresses).toContain("type AddressResolverConfig");
    expect(sdkAddresses).toContain("backendOriginOverrideStorageKey");
    expect(sdkAddresses).toContain("launcherOriginStorageKey");
  });

  it("rejects stale browser and docs references to deleted host shims", () => {
    const scanRoots = [
      {
        root: resolve(repoRoot, "frontend/tests/e2e"),
        label: "frontend/tests/e2e",
        extensions: [".ts", ".tsx"],
      },
      {
        root: resolve(repoRoot, "docs"),
        label: "docs",
        extensions: [".md"],
      },
    ];
    const violations: string[] = [];

    for (const scanRoot of scanRoots) {
      for (const relativePath of listRelativeFiles(scanRoot.root)) {
        if (
          !scanRoot.extensions.some((extension) =>
            relativePath.endsWith(extension),
          )
        ) {
          continue;
        }
        const content = readFileSync(
          resolve(scanRoot.root, relativePath),
          "utf8",
        );
        for (const forbiddenPath of deletedHostAppSubsystemShimReferenceSnippets) {
          if (content.includes(forbiddenPath)) {
            violations.push(
              `${scanRoot.label}/${relativePath}: ${forbiddenPath}`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("publishes standalone SDK types instead of source-file types", () => {
    const sdkPackageJson = JSON.parse(
      readPluginFrontendFile("vendor/app-subsystem-frontend-sdk/package.json"),
    ) as {
      exports?: Record<string, { types?: string; default?: string }>;
      types?: string;
    };
    const sdkTypes = readPluginFrontendFile(
      "vendor/app-subsystem-frontend-sdk/types/index.d.ts",
    );

    expect(sdkPackageJson.types).toBe("./types/index.d.ts");
    expect(sdkPackageJson.exports?.["."]?.types).toBe("./types/index.d.ts");
    expect(sdkPackageJson.exports?.["."]?.default).toBe("./dist/index.js");
    for (const forbiddenSnippet of [
      "frontend/src",
      "utils/",
      "state/",
      "openapi/",
      "plugins/",
    ]) {
      expect(sdkTypes).not.toContain(forbiddenSnippet);
    }
  });

  it("keeps vendored SDK declarations aligned with the source SDK contract", () => {
    const sourceSdkTypes = readSourceSdkFile("types/index.d.ts");
    const vendoredSdkTypes = readPluginFrontendFile(
      "vendor/app-subsystem-frontend-sdk/types/index.d.ts",
    );

    expect(vendoredSdkTypes).toBe(sourceSdkTypes);
    expect(sourceSdkTypes).toContain("data: T | undefined;");
    expect(sourceSdkTypes).toContain("status: number | undefined;");
    expect(sourceSdkTypes).toContain("hasResponse: boolean;");
    expect(sourceSdkTypes).toContain(
      "response is ResponseDataAndStatus<T> & { data: T; status: number }",
    );
    expect(sourceSdkTypes).toContain(
      "export declare function getCurrentEffectiveSectionImpl(",
    );
    expect(sourceSdkTypes).toContain(
      "export declare function getCurrentEffectiveSectionImplIfPresent(",
    );
    expect(sourceSdkTypes).not.toContain("error?: unknown;");
    expect(sourceSdkTypes).not.toContain("request?: Request;");
    expect(sourceSdkTypes).not.toContain("response?: Response;");
  });

  it("keeps source and vendored SDK declarations standalone-typecheckable", () => {
    const sourceSdkTypesPath = resolve(
      repoRoot,
      "frontend",
      "plugin-sdk",
      "app-subsystem",
      "types",
      "index.d.ts",
    );
    const vendoredSdkTypesPath = resolve(
      pluginFrontendRoot,
      "vendor",
      "app-subsystem-frontend-sdk",
      "types",
      "index.d.ts",
    );

    expect(strictDeclarationDiagnostics(sourceSdkTypesPath)).toEqual([]);
    expect(strictDeclarationDiagnostics(vendoredSdkTypesPath)).toEqual([]);
  });

  it("keeps the source SDK package source-first and package-owned", () => {
    const sourceSdkPackageJson = JSON.parse(
      readSourceSdkFile("package.json"),
    ) as {
      scripts?: Record<string, string>;
      exports?: Record<string, { types?: string; default?: string }>;
      pnpm?: { overrides?: Record<string, string> };
      types?: string;
    };
    const sourceSdkViteConfig = readSourceSdkFile("vite.config.mjs");
    const sourceSdkTsconfig = readSourceSdkFile("tsconfig.json");

    expect(sourceSdkPackageJson.types).toBe("./types/index.d.ts");
    expect(sourceSdkPackageJson.scripts?.build).toBe(
      "vite build --config vite.config.mjs",
    );
    expect(sourceSdkPackageJson.scripts?.typecheck).toBe(
      "tsc --noEmit -p tsconfig.typecheck.json",
    );
    expect(sourceSdkPackageJson.exports?.["."]?.types).toBe(
      "./types/index.d.ts",
    );
    expect(sourceSdkPackageJson.exports?.["."]?.default).toBe("./src/index.ts");
    expect(sourceSdkPackageJson.pnpm?.overrides?.esbuild).toBe("0.25.12");
    expect(sourceSdkPackageJson.pnpm?.overrides?.rollup).toBe("4.59.1");
    expect(sourceSdkViteConfig).not.toContain("frontendSrcDir");
    expect(sourceSdkViteConfig).not.toContain("openapi:");
    expect(sourceSdkViteConfig).not.toContain("utils:");
    expect(sourceSdkTsconfig).not.toContain('"paths"');
  });

  it("keeps source SDK generated non-HTTP surfaces aligned with the host owner", () => {
    const hostSidecar = JSON.parse(
      readHostFrontendFile("generation/non_http_shared/sidecar.json"),
    ) as {
      contracts?: Array<{
        frontendSDKScopes?: string[];
        kind?: string;
        name?: string;
      }>;
      exportedValues?: Array<{
        frontendSDKScopes?: unknown;
        name?: string;
        value?: unknown;
      }>;
    };
    const sourceSdkSidecar = JSON.parse(
      readSourceSdkFile("src/generated/sidecar.json"),
    ) as {
      contracts?: Array<{
        frontendSDKScopes?: string[];
        kind?: string;
        name?: string;
      }>;
      exportedValues?: Array<{
        frontendSDKScopes?: unknown;
        name?: string;
        value?: unknown;
      }>;
    };
    const sourceSdkGeneratedTypes = readSourceSdkFile("src/generatedTypes.ts");
    const sourceNonHTTPGeneratedRoot = resolve(
      repoRoot,
      "frontend",
      "plugin-sdk",
      "app-subsystem",
      "src/openapi/non_http/generated",
    );
    const hostContractsByName = new Map(
      (hostSidecar.contracts ?? []).map((entry) => [entry.name, entry]),
    );
    const hostValuesByName = new Map(
      (hostSidecar.exportedValues ?? []).map((entry) => [entry.name, entry]),
    );
    const sourceValuesByName = new Map(
      (sourceSdkSidecar.exportedValues ?? []).map((entry) => [
        entry.name,
        entry,
      ]),
    );

    expect(existsSync(sourceNonHTTPGeneratedRoot)).toBe(false);
    expect(sourceSdkGeneratedTypes).not.toContain("openapi/non_http/generated");
    expect(sourceSdkGeneratedTypes).toContain(
      'readGeneratedStringEnum("SectionType")',
    );
    expect(sourceSdkGeneratedTypes).toContain(
      'readGeneratedExportedValue<TransportRoutes>("TransportRouteConstants")',
    );
    expect(hostContractsByName.get("SectionType")?.frontendSDKScopes).toContain(
      "app-subsystem",
    );
    expect(
      hostContractsByName.get("AddKwargResult")?.frontendSDKScopes ?? [],
    ).not.toContain("app-subsystem");

    for (const contract of sourceSdkSidecar.contracts ?? []) {
      expect(contract).toEqual(hostContractsByName.get(contract.name));
    }
    for (const exportedValue of sourceSdkSidecar.exportedValues ?? []) {
      if (
        [
          "BootstrapProtocol",
          "EndpointOriginPolicyByRoute",
          "ModeScopedLauncherRoutesList",
          "TransportRouteConstants",
        ].includes(exportedValue.name ?? "")
      ) {
        continue;
      }
      expect(exportedValue).toEqual(hostValuesByName.get(exportedValue.name));
    }
    expect(sourceValuesByName.get("BootstrapProtocol")?.value).toEqual({
      launcherOriginStorageKey: (
        hostValuesByName.get("BootstrapProtocol")?.value as {
          launcherOriginStorageKey?: unknown;
        }
      ).launcherOriginStorageKey,
    });
    expect(
      sourceValuesByName.get("EndpointOriginPolicyByRoute")?.value,
    ).toEqual({
      "/__setta__/tools/call": (
        hostValuesByName.get("EndpointOriginPolicyByRoute")?.value as Record<
          string,
          unknown
        >
      )["/__setta__/tools/call"],
    });
    expect(
      sourceValuesByName.get("ModeScopedLauncherRoutesList")?.value,
    ).toEqual([]);
    const hostTransportRoutes = hostValuesByName.get("TransportRouteConstants")
      ?.value as {
      apiPrefix?: unknown;
      binary?: Record<string, unknown>;
      root?: Record<string, unknown>;
      websocket?: Record<string, unknown>;
    };
    expect(sourceValuesByName.get("TransportRouteConstants")?.value).toEqual({
      apiPrefix: hostTransportRoutes.apiPrefix,
      binary: {
        download: hostTransportRoutes.binary?.download,
        upload: hostTransportRoutes.binary?.upload,
      },
      root: {
        bootstrapPage: hostTransportRoutes.root?.bootstrapPage,
        toolsCall: hostTransportRoutes.root?.toolsCall,
      },
      websocket: {
        frontend: hostTransportRoutes.websocket?.frontend,
        listenerById: hostTransportRoutes.websocket?.listenerById,
        terminalBySection: hostTransportRoutes.websocket?.terminalBySection,
      },
    });

    expect(sourceSdkSidecar.contracts?.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "EndpointOrigin",
        "SectionType",
        "WorkspaceLaunchRouteKind",
      ]),
    );
    expect(sourceSdkSidecar.exportedValues?.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "ServerModeBoundaryPolicyByMode",
        "TransportRouteConstants",
      ]),
    );
    expect(
      sourceSdkSidecar.contracts?.map((entry) => entry.name),
    ).not.toContain("AddKwargResult");
    expect(
      sourceSdkSidecar.exportedValues?.map((entry) => entry.name),
    ).not.toContain("PluginFrontendBuildManifest");
    expect(JSON.stringify(sourceSdkSidecar)).not.toContain(
      "addLauncherRecentWorkspace",
    );
  });

  it("prunes source SDK sidecar from owner metadata instead of SDK source reads", () => {
    const tempRoot = mkdtempSync(resolve(tmpdir(), "setta-sdk-sidecar-"));
    try {
      const sourceSidecarPath = resolve(tempRoot, "source-sidecar.json");
      const outputSidecarPath = resolve(tempRoot, "output-sidecar.json");
      writeFileSync(
        sourceSidecarPath,
        `${JSON.stringify({
          schemaVersion: 1,
          contracts: [
            {
              name: "SDKEnum",
              kind: "enum",
              frontendSDKScopes: ["app-subsystem"],
              enumValues: [{ name: "Value", value: "value" }],
            },
            {
              name: "HostOnlyEnum",
              kind: "enum",
              enumValues: [{ name: "Host", value: "host" }],
            },
          ],
          exportedValues: [
            {
              name: "SDKValue",
              frontendSDKScopes: [
                {
                  scope: "app-subsystem",
                  valuePaths: [["nested", "keep"]],
                },
              ],
              value: {
                nested: { keep: "yes", drop: "no" },
                drop: true,
              },
            },
            {
              name: "HostOnlyValue",
              value: { keep: false },
            },
          ],
        })}\n`,
      );

      execFileSync(process.execPath, [
        resolve(
          repoRoot,
          "frontend",
          "generation",
          "prune_app_subsystem_sdk_non_http_sidecar.mjs",
        ),
        sourceSidecarPath,
        outputSidecarPath,
      ]);

      const output = JSON.parse(readFileSync(outputSidecarPath, "utf8")) as {
        contracts: Array<{ name: string }>;
        exportedValues: Array<{ name: string; value: unknown }>;
      };
      expect(output.contracts.map((entry) => entry.name)).toEqual(["SDKEnum"]);
      expect(output.exportedValues).toEqual([
        {
          name: "SDKValue",
          frontendSDKScopes: [
            {
              scope: "app-subsystem",
              valuePaths: [["nested", "keep"]],
            },
          ],
          value: { nested: { keep: "yes" } },
        },
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps source SDK generated HTTP surfaces pruned to the app-subsystem SDK contract", () => {
    const generatedHTTPRoot = "src/openapi/http/generated";
    const sourceFiles = listRelativeFiles(
      resolve(
        repoRoot,
        "frontend",
        "plugin-sdk",
        "app-subsystem",
        generatedHTTPRoot,
      ),
    );
    const sdkOpenAPI = JSON.parse(
      readSourceSdkFile("generation/http_openapi/openapi.json"),
    ) as {
      paths?: Record<
        string,
        Record<string, { operationId?: string; [key: string]: unknown }>
      >;
    };
    const sourceSDK = readSourceSdkFile(
      "src/openapi/http/generated/sdk.gen.ts",
    );
    const sourceTypes = readSourceSdkFile(
      "src/openapi/http/generated/types.gen.ts",
    );
    const combinedGeneratedSurface = `${sourceSDK}\n${sourceTypes}`;

    expect(sourceFiles).toContain("sdk.gen.ts");
    expect(sourceFiles).toContain("types.gen.ts");
    expect(sourceSDK).toContain("export const getAppDefinition =");
    expect(sourceSDK).toContain("export const publishAppDeployment =");
    expect(sourceSDK).toContain("export const getServerMode =");
    expect(sourceTypes).toContain('url: "/getAppDefinition";');
    expect(sourceTypes).toContain('url: "/app/deployments";');

    for (const forbiddenSnippet of [
      "acceptRenameRefactor",
      "addKwarg",
      "addLauncherRecentWorkspace",
      'url: "/acceptRenameRefactor";',
      'url: "/addKwarg";',
      'url: "/addLauncherRecentWorkspace";',
    ]) {
      expect(combinedGeneratedSurface).not.toContain(forbiddenSnippet);
    }

    const operationIds = new Set<string>();
    for (const pathItem of Object.values(sdkOpenAPI.paths ?? {})) {
      for (const operation of Object.values(pathItem)) {
        if (operation && typeof operation.operationId === "string") {
          operationIds.add(operation.operationId);
        }
      }
    }
    expect(operationIds).toContain("getAppDefinition");
    expect(operationIds).toContain("publishAppDeployment");
    expect(operationIds).toContain("getServerMode");
    expect(operationIds).not.toContain("acceptRenameRefactor");
    expect(operationIds).not.toContain("addKwarg");
    expect(operationIds).not.toContain("addLauncherRecentWorkspace");
  });
});
