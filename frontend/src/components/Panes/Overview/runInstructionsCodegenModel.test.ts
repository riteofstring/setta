import {
  CodeObjTypeEnum,
  CodeObjValueRepresentationModeEnum,
  PluginRuntimeStateEnum,
  SectionTypeEnum,
  createPluginStatusEntry,
  type PluginStatusEntry,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  collectPluginCodegenRegistrations,
  getCodeObjRepresentationOptions,
  getRepresentationOptions,
} from "./runInstructionsCodegenModel";

function buildPluginStatusEntry(
  overrides: Partial<PluginStatusEntry> = {},
): PluginStatusEntry {
  return createPluginStatusEntry({
    pluginId: "acme.plugin",
    name: "Acme Plugin",
    version: "1.0.0",
    state: PluginRuntimeStateEnum.active,
    sourceScope: "workspace",
    sourceScopeLabel: "workspace",
    sourceManager: "setta",
    sourceManagerHint: null,
    sourcePath: "/tmp/acme.plugin",
    canonicalSourceKey: "github:acme/plugin",
    sourceDigestSha256: null,
    shadowedBySourcePath: null,
    requestedCapabilities: [],
    effectiveCapabilities: [],
    blockedCapabilities: [],
    runtimePayloadDigestSha256: "digest-acme-plugin",
    restartRequired: false,
    errors: [],
    registeredCodegenTargets: [],
    ...overrides,
  });
}

describe("runInstructionsCodegenModel", () => {
  it("dedupes repeated plugin target ids and keeps a stable registration sort", () => {
    // Multiple plugins can expose overlapping target ids, but the UI should
    // show each target once in a predictable order.
    const registrations = collectPluginCodegenRegistrations([
      buildPluginStatusEntry({
        pluginId: "zeta.plugin",
        registeredCodegenTargets: [
          {
            targetId: "zeta:python",
            pluginId: "zeta.plugin",
            language: "python",
            name: "Zeta Python",
            defaultFileName: "setta_gen.py",
          },
          {
            targetId: "shared:typescript",
            pluginId: "zeta.plugin",
            language: "typescript",
            name: "Shared TypeScript",
            defaultFileName: "setta_gen.ts",
          },
        ],
      }),
      buildPluginStatusEntry({
        pluginId: "alpha.plugin",
        registeredCodegenTargets: [
          {
            targetId: "alpha:go",
            pluginId: "alpha.plugin",
            language: "go",
            name: "Alpha Go",
            defaultFileName: "setta_gen.go",
          },
          {
            targetId: "shared:typescript",
            pluginId: "alpha.plugin",
            language: "typescript",
            name: "Shared TypeScript",
            defaultFileName: "setta_gen.ts",
          },
        ],
      }),
    ]);

    expect(registrations).toEqual([
      {
        targetId: "alpha:go",
        language: "go",
        name: "Alpha Go",
      },
      {
        targetId: "shared:typescript",
        language: "typescript",
        name: "Shared TypeScript",
      },
      {
        targetId: "zeta:python",
        language: "python",
        name: "Zeta Python",
      },
    ]);
  });

  it("returns section representation options that match each supported section family", () => {
    // Chat and file-producing sections allow more output modes than generic sections.
    expect(getRepresentationOptions(SectionTypeEnum.Chat)).toEqual([
      "expression",
      "file_path",
      "file_read",
    ]);
    expect(getRepresentationOptions(SectionTypeEnum.Draw)).toEqual([
      "file_path",
      "file_read",
    ]);
    expect(getRepresentationOptions(SectionTypeEnum.Chart)).toEqual([
      "expression",
      "file_path",
    ]);
    expect(getRepresentationOptions(SectionTypeEnum.Group)).toEqual([
      "expression",
    ]);
  });

  it("returns code obj representation options that match the param type contract", () => {
    // The codegen controls rely on this mapping to avoid offering invalid output formats.
    expect(
      getCodeObjRepresentationOptions(CodeObjTypeEnum.DropzoneParam),
    ).toEqual([
      CodeObjValueRepresentationModeEnum.file_path,
      CodeObjValueRepresentationModeEnum.file_read,
    ]);
    expect(getCodeObjRepresentationOptions(CodeObjTypeEnum.TextParam)).toEqual([
      CodeObjValueRepresentationModeEnum.string,
    ]);
    expect(
      getCodeObjRepresentationOptions(CodeObjTypeEnum.SliderParam),
    ).toEqual([
      CodeObjValueRepresentationModeEnum.expression,
      CodeObjValueRepresentationModeEnum.json_parsed,
      CodeObjValueRepresentationModeEnum.string,
    ]);
    expect(
      getCodeObjRepresentationOptions(CodeObjTypeEnum.ButtonParam),
    ).toEqual([CodeObjValueRepresentationModeEnum.expression]);
  });
});
