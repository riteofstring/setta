import { pluginsPaneTestApi } from "components/Panes/Overview/Plugins/PluginsPane";
import {
  createPluginListEntry,
  createPluginStatusEntry,
  PluginRuntimeStateEnum,
  type PluginInstallResponse,
  type PluginListEntry,
  type PluginRestartCapability,
  type PluginStatusEntry,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

function buildPluginListEntry(
  overrides: Partial<PluginListEntry>,
): PluginListEntry {
  return createPluginListEntry({
    pluginId: "acme.plugin",
    name: "Acme Plugin",
    version: "1.0.0",
    sourceScope: "workspace",
    sourceScopeLabel: "workspace",
    sourceManager: "setta",
    sourceManagerHint: null,
    canonicalSourceKey: "github:acme/plugin",
    sourceDigestSha256: null,
    frontend: {
      entrypointUrl: null,
      styleUrl: null,
    },
    content: {
      hasBlueprints: false,
      hasProjectTemplates: false,
      hasPrompts: false,
    },
    config: {
      hasSchema: false,
      schemaJson: null,
    },
    effectiveCapabilities: [],
    restartRequired: false,
    ...overrides,
  });
}

function buildPluginStatusEntry(
  overrides: Partial<PluginStatusEntry>,
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
    registeredLanguageServers: [],
    registeredExternalAgentAdapters: [],
    registeredCodegenTargets: [],
    restartRequired: false,
    errors: [],
    ...overrides,
  });
}

describe("plugins pane helpers", () => {
  it("validates supported install source schemes", () => {
    expect(pluginsPaneTestApi.validateInstallSourceSpec("")).toBe(
      "Source spec is required.",
    );
    expect(
      pluginsPaneTestApi.validateInstallSourceSpec("file:/tmp/plugin"),
    ).toBe("Unsupported source spec. Use github: or pypi:.");
    expect(pluginsPaneTestApi.validateInstallSourceSpec("github:acme")).toBe(
      "Invalid github source spec. Expected github:owner/repo[#ref] or github:owner/repo@ref.",
    );
    expect(pluginsPaneTestApi.validateInstallSourceSpec("pypi:   ")).toBe(
      "Invalid pypi source spec. Expected pypi:package or pypi:package==version.",
    );

    expect(
      pluginsPaneTestApi.validateInstallSourceSpec("github:acme/plugin#v1"),
    ).toBeNull();
    expect(
      pluginsPaneTestApi.validateInstallSourceSpec("github:acme/plugin@v1"),
    ).toBeNull();
    expect(
      pluginsPaneTestApi.validateInstallSourceSpec("pypi:setta-fixture==0.1.0"),
    ).toBeNull();
  });

  it("sorts restart-required plugin ids deterministically", () => {
    const ids = pluginsPaneTestApi.getRestartRequiredPluginIds([
      buildPluginListEntry({
        pluginId: "zeta.plugin",
        restartRequired: true,
      }),
      buildPluginListEntry({
        pluginId: "alpha.plugin",
        restartRequired: true,
      }),
      buildPluginListEntry({
        pluginId: "beta.plugin",
        restartRequired: false,
      }),
    ]);

    expect(ids).toEqual(["alpha.plugin", "zeta.plugin"]);
  });

  it("builds manual restart plans from capability payloads", () => {
    const manual = pluginsPaneTestApi.buildRestartActionPlan({
      mode: "manual",
      command: "setta restart",
      reason: "Programmatic restart is not available in this runtime.",
    } as PluginRestartCapability);

    expect(manual.mode).toBe("manual");
    if (manual.mode !== "manual") {
      throw new Error("Expected manual restart plan.");
    }
    expect(manual.command).toBe("setta restart");
    expect(manual.message).toBe(
      "Manual restart required: setta restart. Programmatic restart is not available in this runtime.",
    );
  });

  it("builds programmatic restart plans from capability payloads", () => {
    const programmatic = pluginsPaneTestApi.buildRestartActionPlan({
      mode: "programmatic",
      command: null,
      reason: null,
    } as PluginRestartCapability);
    expect(programmatic.mode).toBe("programmatic");
  });

  it("reports blocked and requested-unavailable capability statuses", () => {
    const plugin = buildPluginListEntry({
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const blockedStatusEntry = buildPluginStatusEntry({
      requestedCapabilities: ["registerCommand", "registerPane"],
      effectiveCapabilities: [],
      blockedCapabilities: [
        {
          capability: "registerCommand",
          reason: "mode_policy",
        },
      ],
    });
    const blockedStatus = pluginsPaneTestApi.getPluginCapabilityStatus(
      blockedStatusEntry,
      plugin,
      "registerCommand",
    );
    expect(blockedStatus).toBe("blocked");
    expect(
      pluginsPaneTestApi.getBlockedCapabilityReason(
        blockedStatusEntry.blockedCapabilities,
        "registerCommand",
      ),
    ).toBe("mode_policy");

    const requestedUnavailableStatusEntry = buildPluginStatusEntry({
      requestedCapabilities: ["registerPane"],
      effectiveCapabilities: [],
      blockedCapabilities: [],
    });
    const requestedUnavailableStatus =
      pluginsPaneTestApi.getPluginCapabilityStatus(
        requestedUnavailableStatusEntry,
        plugin,
        "registerPane",
      );
    expect(requestedUnavailableStatus).toBe("requested_unavailable");
  });

  it("formats capability unavailable messaging with mode-policy reason", () => {
    expect(
      pluginsPaneTestApi.buildCapabilityUnavailableMessage({
        capability: "registerCommand",
        status: "blocked",
        reason: "mode_policy",
        serverMode: "share",
      }),
    ).toBe("registerCommand is blocked by mode policy in share mode.");
    expect(
      pluginsPaneTestApi.buildCapabilityUnavailableMessage({
        capability: "registerPane",
        status: "requested_unavailable",
        reason: null,
        serverMode: "app",
      }),
    ).toBe("registerPane was requested but is not effective in this runtime.");
  });

  it("extracts and sorts registered language servers from plugin status", () => {
    const statusEntry = {
      ...buildPluginStatusEntry({}),
      registeredLanguageServers: [
        {
          name: "plugin:typescript",
          language: "typescript",
          command: "ts-lsp",
          args: ["--stdio"],
          settingsKey: "typescriptLanguageServer",
        },
        {
          name: "plugin:javascript",
          language: "javascript",
          command: "js-lsp",
          args: [],
          settingsKey: null,
        },
      ],
    } as PluginStatusEntry;

    const registrations =
      pluginsPaneTestApi.getRegisteredLanguageServers(statusEntry);

    expect(registrations.map((entry) => entry.language)).toEqual([
      "javascript",
      "typescript",
    ]);
    expect(registrations[1].settingsKey).toBe("typescriptLanguageServer");
  });

  it("reuses cached sorted registration arrays for unchanged plugin status objects", () => {
    const statusEntry = {
      ...buildPluginStatusEntry({}),
      registeredLanguageServers: [
        {
          name: "plugin:typescript",
          language: "typescript",
          command: "ts-lsp",
          args: ["--stdio"],
          settingsKey: "typescriptLanguageServer",
        },
      ],
      registeredExternalAgentAdapters: [
        {
          adapterId: "plugin:alpha",
          pluginId: "plugin",
          name: "Alpha Adapter",
          runModes: ["sdk"],
          command: "alpha",
          args: [],
          envVarWhitelist: [],
          defaultModel: null,
        },
      ],
      registeredCodegenTargets: [
        {
          targetId: "plugin:alpha",
          pluginId: "plugin",
          language: "typescript",
          name: "TypeScript",
          defaultFileName: "setta_gen.ts",
        },
      ],
    } as PluginStatusEntry;

    const firstLanguageServers =
      pluginsPaneTestApi.getRegisteredLanguageServers(statusEntry);
    const secondLanguageServers =
      pluginsPaneTestApi.getRegisteredLanguageServers(statusEntry);
    const firstAdapters =
      pluginsPaneTestApi.getRegisteredExternalAgentAdapters(statusEntry);
    const secondAdapters =
      pluginsPaneTestApi.getRegisteredExternalAgentAdapters(statusEntry);
    const firstCodegenTargets =
      pluginsPaneTestApi.getRegisteredCodegenTargets(statusEntry);
    const secondCodegenTargets =
      pluginsPaneTestApi.getRegisteredCodegenTargets(statusEntry);

    expect(firstLanguageServers).toBe(secondLanguageServers);
    expect(firstAdapters).toBe(secondAdapters);
    expect(firstCodegenTargets).toBe(secondCodegenTargets);
  });

  it("returns no language servers when status payload omits registrations", () => {
    const statusEntry = buildPluginStatusEntry({}) as PluginStatusEntry;
    delete (
      statusEntry as PluginStatusEntry & {
        registeredLanguageServers?: unknown;
      }
    ).registeredLanguageServers;

    expect(
      pluginsPaneTestApi.getRegisteredLanguageServers(statusEntry),
    ).toEqual([]);
  });

  it("extracts and sorts registered external agent adapters from plugin status", () => {
    const statusEntry = {
      ...buildPluginStatusEntry({}),
      registeredExternalAgentAdapters: [
        {
          adapterId: "plugin:beta",
          pluginId: "plugin",
          name: "Beta Adapter",
          runModes: ["sdk"],
          command: "beta",
          args: [],
          envVarWhitelist: [],
          defaultModel: null,
        },
        {
          adapterId: "plugin:alpha",
          pluginId: "plugin",
          name: "Alpha Adapter",
          runModes: ["sdk", "server"],
          command: "alpha",
          args: ["--stdio"],
          envVarWhitelist: ["OPENHANDS_API_KEY"],
          defaultModel: "openhands/default",
        },
      ],
    } as PluginStatusEntry;

    const registrations =
      pluginsPaneTestApi.getRegisteredExternalAgentAdapters(statusEntry);

    expect(registrations.map((entry) => entry.name)).toEqual([
      "Alpha Adapter",
      "Beta Adapter",
    ]);
    expect(registrations[0].defaultModel).toBe("openhands/default");
  });

  it("returns no external agent adapters when status payload omits registrations", () => {
    const statusEntry = buildPluginStatusEntry({}) as PluginStatusEntry;
    delete (
      statusEntry as PluginStatusEntry & {
        registeredExternalAgentAdapters?: unknown;
      }
    ).registeredExternalAgentAdapters;

    expect(
      pluginsPaneTestApi.getRegisteredExternalAgentAdapters(statusEntry),
    ).toEqual([]);
  });

  it("extracts and sorts registered codegen targets from plugin status", () => {
    const statusEntry = {
      ...buildPluginStatusEntry({}),
      registeredCodegenTargets: [
        {
          targetId: "plugin:beta",
          pluginId: "plugin",
          language: "zig",
          name: "Zig",
          defaultFileName: "setta_gen.zig",
        },
        {
          targetId: "plugin:alpha",
          pluginId: "plugin",
          language: "typescript",
          name: "TypeScript",
          defaultFileName: "setta_gen.ts",
        },
      ],
    } as PluginStatusEntry;

    const registrations =
      pluginsPaneTestApi.getRegisteredCodegenTargets(statusEntry);

    expect(registrations.map((entry) => entry.name)).toEqual([
      "TypeScript",
      "Zig",
    ]);
    expect(registrations[0].defaultFileName).toBe("setta_gen.ts");
  });

  it("returns no codegen targets when status payload omits registrations", () => {
    const statusEntry = buildPluginStatusEntry({}) as PluginStatusEntry;
    delete (
      statusEntry as PluginStatusEntry & {
        registeredCodegenTargets?: unknown;
      }
    ).registeredCodegenTargets;

    expect(pluginsPaneTestApi.getRegisteredCodegenTargets(statusEntry)).toEqual(
      [],
    );
  });

  it("parses language server settings drafts as JSON objects", () => {
    expect(pluginsPaneTestApi.parseLanguageServerSettingsDraft("")).toEqual({
      value: {},
      error: null,
    });
    expect(
      pluginsPaneTestApi.parseLanguageServerSettingsDraft('{"a": 1}'),
    ).toEqual({
      value: { a: 1 },
      error: null,
    });
    expect(
      pluginsPaneTestApi.parseLanguageServerSettingsDraft("[1, 2, 3]"),
    ).toEqual({
      value: {},
      error: "Language server settings must be a JSON object.",
    });
    expect(pluginsPaneTestApi.parseLanguageServerSettingsDraft("{")).toEqual({
      value: {},
      error: "Language server settings JSON is invalid.",
    });
  });

  it("parses plugin config drafts as JSON objects", () => {
    expect(pluginsPaneTestApi.parsePluginConfigDraft("")).toEqual({
      value: {},
      error: null,
    });
    expect(
      pluginsPaneTestApi.parsePluginConfigDraft('{"enabled": true}'),
    ).toEqual({
      value: { enabled: true },
      error: null,
    });
    expect(pluginsPaneTestApi.parsePluginConfigDraft("[1,2]")).toEqual({
      value: {},
      error: "Plugin config must be a JSON object.",
    });
    expect(pluginsPaneTestApi.parsePluginConfigDraft("{")).toEqual({
      value: {},
      error: "Plugin config JSON is invalid.",
    });
  });

  it("gets and sets nested language server settings values by key path", () => {
    const initial = {
      basedpyright: {
        analysis: {
          typeCheckingMode: "basic",
        },
      },
    };

    const next = pluginsPaneTestApi.setLanguageServerSettingsValue(
      initial,
      "fixtureTypescriptLanguageServer",
      {
        analysis: {
          strictNullChecks: true,
        },
      },
    );
    expect(initial).toEqual({
      basedpyright: {
        analysis: {
          typeCheckingMode: "basic",
        },
      },
    });
    expect(
      pluginsPaneTestApi.getLanguageServerSettingsValue(next, "basedpyright"),
    ).toEqual({
      analysis: {
        typeCheckingMode: "basic",
      },
    });
    expect(
      pluginsPaneTestApi.getLanguageServerSettingsValue(
        next,
        "fixtureTypescriptLanguageServer",
      ),
    ).toEqual({
      analysis: {
        strictNullChecks: true,
      },
    });
    expect(
      pluginsPaneTestApi.formatLanguageServerSettingsDraft(
        pluginsPaneTestApi.getLanguageServerSettingsValue(
          next,
          "fixtureTypescriptLanguageServer",
        ),
      ),
    ).toContain("strictNullChecks");
  });

  it("builds install trust summary messaging", () => {
    const installSummary = {
      pluginId: "acme.plugin",
      version: "1.2.3",
      sourceScope: "workspace",
      sourceScopeLabel: "workspace",
      sourcePath: "/tmp/acme.plugin",
      canonicalSourceKey: "github:acme/plugin",
      sourceDigestSha256: "abc123",
      requestedCapabilities: ["registerPane"],
      trustStatus: "unverified",
      trustWarning: "Source is unverified. Install only from trusted owners.",
      components: ["frontend"],
      state: PluginRuntimeStateEnum.active,
      restartRequired: false,
    } as PluginInstallResponse;
    expect(
      pluginsPaneTestApi.buildInstallTrustSummaryMessage(installSummary),
    ).toBe(
      "Trust (unverified): Source is unverified. Install only from trusted owners.",
    );
  });

  it("builds package-manager guidance messaging", () => {
    expect(
      pluginsPaneTestApi.buildSourceManagerGuidanceMessage({
        sourceManager: "package_manager",
        sourceManagerHint:
          "Managed by Python package manager in active environment.",
      }),
    ).toBe("Managed by Python package manager in active environment.");
    expect(
      pluginsPaneTestApi.buildSourceManagerGuidanceMessage({
        sourceManager: "setta",
        sourceManagerHint: null,
      }),
    ).toBe("Managed by Setta installer.");
  });
});
