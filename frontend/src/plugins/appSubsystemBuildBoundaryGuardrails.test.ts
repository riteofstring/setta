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

describe("app plugin frontend build boundary guardrails", () => {
  it("keeps plugin frontend package resolution inside the plugin tree", () => {
    const packageJson = JSON.parse(readPluginFrontendFile("package.json")) as {
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

  it("keeps the repo wrapper as a delegating convenience layer only", () => {
    const wrapperScript = readPluginFrontendFile(
      "../../../frontend/scripts/buildAppSubsystemPluginFrontend.mjs",
    );

    expect(wrapperScript).toContain(
      'spawnSync(pnpmCommand, ["run", "build"], {',
    );
    expect(wrapperScript).toContain("cwd: pluginFrontendDir");
    expect(wrapperScript).not.toContain("frontend/package.json");
    expect(wrapperScript).not.toContain("vite build --config");
  });
});
