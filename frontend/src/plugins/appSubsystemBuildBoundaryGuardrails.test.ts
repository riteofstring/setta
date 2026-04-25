import { readFileSync } from "node:fs";
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
    expect(sourceSdkViteConfig).not.toContain("frontendSrcDir");
    expect(sourceSdkViteConfig).not.toContain("openapi:");
    expect(sourceSdkViteConfig).not.toContain("utils:");
    expect(sourceSdkTsconfig).not.toContain('"paths"');
  });

  it("keeps source SDK generated non-HTTP surfaces aligned with the host owner", () => {
    const hostNonHTTPTypes = readHostFrontendFile(
      "src/openapi/non_http/generated/types.gen.ts",
    );
    const sourceSdkNonHTTPTypes = readSourceSdkFile(
      "src/openapi/non_http/generated/types.gen.ts",
    );
    const hostSidecar = readHostFrontendFile(
      "generation/non_http_shared/sidecar.json",
    );
    const sourceSdkSidecar = readSourceSdkFile("src/generated/sidecar.json");

    expect(hostNonHTTPTypes).toContain("PluginFrontendBuildManifest = {");
    expect(hostNonHTTPTypes).toContain(
      "build?: PluginFrontendBuildManifest | null;",
    );
    expect(hostSidecar).toContain('"name": "PluginFrontendBuildManifest"');
    expect(sourceSdkNonHTTPTypes).toContain(
      "PluginFrontendBuildManifest = {",
    );
    expect(sourceSdkNonHTTPTypes).toContain(
      "build?: PluginFrontendBuildManifest | null;",
    );
    expect(sourceSdkSidecar).toContain('"name": "PluginFrontendBuildManifest"');
  });
});
