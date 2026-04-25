import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "..");
const pluginFrontendRoot = resolve(
  repoRoot,
  "plugins",
  "setta-json-render-app-gen",
  "frontend",
);

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
      "getCurrentEffectiveSectionImpl(projectState: SingleConfig, sectionId: string, includePreview?: boolean): JsonRecord;",
    );
    expect(sourceSdkTypes).toContain(
      "getCurrentEffectiveSectionImplIfPresent(projectState: SingleConfig, sectionId: string, includePreview?: boolean): JsonRecord | null;",
    );
    expect(sourceSdkTypes).not.toContain("error?: unknown;");
    expect(sourceSdkTypes).not.toContain("request?: Request;");
    expect(sourceSdkTypes).not.toContain("response?: Response;");
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
      contracts?: Array<{ kind?: string; name?: string }>;
      exportedValues?: Array<{ name?: string; value?: unknown }>;
    };
    const sourceSdkSidecar = JSON.parse(
      readSourceSdkFile("src/generated/sidecar.json"),
    ) as {
      contracts?: Array<{ kind?: string; name?: string }>;
      exportedValues?: Array<{ name?: string; value?: unknown }>;
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
