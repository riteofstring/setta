import { pluginsPaneTestApi } from "components/Panes/Overview/Plugins/PluginsPane";
import {
  createPluginListEntry,
  createPluginStatusEntry,
  PluginRuntimeStateEnum,
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
    sourcePath: "/tmp/acme.plugin",
    canonicalSourceKey: "github:acme/plugin",
    sourceDigestSha256: null,
    shadowedBySourcePath: null,
    requestedCapabilities: [],
    effectiveCapabilities: [],
    blockedCapabilities: [],
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
});
