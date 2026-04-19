import {
  buildBusyPluginIdSet,
  buildCapabilityStatusIndex,
  buildCapabilityUnavailableMessage,
  buildInstallTrustSummaryMessage,
  buildPluginListEntryCardKey,
  buildPluginSourceIdentityToken,
  buildSourceManagerGuidanceMessage,
  formatPluginConfigDraft,
  getPluginActionErrorDetail,
  isLinkedLocalPluginSource,
  parsePluginConfigDraft,
  resolvePluginConfigFieldPresentation,
} from "components/Panes/Overview/Plugins/PluginsPane.helpers";
import {
  buildPluginRestartActionPlan,
  getRestartRequiredPluginIds,
} from "plugins/restart";
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

const pluginsPaneTestApi = {
  buildPluginListEntryCardKey,
  buildPluginSourceIdentityToken,
  buildBusyPluginIdSet,
  buildInstallTrustSummaryMessage,
  buildSourceManagerGuidanceMessage,
  getPluginActionErrorDetail,
  buildRestartActionPlan: buildPluginRestartActionPlan,
  buildCapabilityStatusIndex,
  buildCapabilityUnavailableMessage,
  formatPluginConfigDraft,
  getRestartRequiredPluginIds,
  parsePluginConfigDraft,
  resolvePluginConfigFieldPresentation,
  isLinkedLocalPluginSource,
};

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
      schemaJson: {},
      schemaJsonDigestSha256: null,
      currentConfig: {},
      currentConfigDigestSha256: null,
    },
    effectiveCapabilities: [],
    enablementSource: null,
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
    enablementSource: null,
    runtimePayloadDigestSha256: "digest-acme-plugin",
    restartRequired: false,
    errors: [],
    ...overrides,
  });
}

describe("plugins pane helpers", () => {
  it("detects linked local plugin sources for action disablement", () => {
    expect(
      pluginsPaneTestApi.isLinkedLocalPluginSource(
        buildPluginListEntry({
          sourceManager: "setta",
          canonicalSourceKey: "local:/tmp/plugin-root",
        }),
      ),
    ).toBe(true);
    expect(
      pluginsPaneTestApi.isLinkedLocalPluginSource(
        buildPluginListEntry({
          sourceManager: "setta",
          canonicalSourceKey: "github:acme/plugin",
        }),
      ),
    ).toBe(false);
    expect(
      pluginsPaneTestApi.isLinkedLocalPluginSource(
        buildPluginListEntry({
          sourceManager: "package_manager",
          canonicalSourceKey: "local:/tmp/plugin-root",
        }),
      ),
    ).toBe(false);
  });

  it("builds plugin source identity tokens from canonical source and digest", () => {
    expect(
      pluginsPaneTestApi.buildPluginSourceIdentityToken(
        buildPluginListEntry({
          sourceScope: "workspace",
          canonicalSourceKey: "github:acme/plugin",
          sourceDigestSha256: "sha256:first",
        }),
      ),
    ).toBe("workspace:github:acme/plugin:sha256:first");

    expect(
      pluginsPaneTestApi.buildPluginSourceIdentityToken(
        buildPluginListEntry({
          sourceScope: "workspace",
          canonicalSourceKey: "github:acme/plugin",
          sourceDigestSha256: null,
        }),
      ),
    ).toBe("workspace:github:acme/plugin:none");
  });

  it("includes source identity in plugin list card keys", () => {
    const firstKey = pluginsPaneTestApi.buildPluginListEntryCardKey(
      buildPluginListEntry({
        pluginId: "acme.plugin",
        version: "1.0.0",
        sourceScope: "workspace",
        canonicalSourceKey: "github:acme/plugin",
        sourceDigestSha256: "sha256:first",
      }),
    );
    const secondKey = pluginsPaneTestApi.buildPluginListEntryCardKey(
      buildPluginListEntry({
        pluginId: "acme.plugin",
        version: "1.0.0",
        sourceScope: "workspace",
        canonicalSourceKey: "github:acme/plugin-fork",
        sourceDigestSha256: "sha256:first",
      }),
    );
    const thirdKey = pluginsPaneTestApi.buildPluginListEntryCardKey(
      buildPluginListEntry({
        pluginId: "acme.plugin",
        version: "1.0.0",
        sourceScope: "workspace",
        canonicalSourceKey: "github:acme/plugin",
        sourceDigestSha256: "sha256:second",
      }),
    );

    expect(firstKey).not.toBe(secondKey);
    expect(firstKey).not.toBe(thirdKey);
  });

  it("derives busy plugin ids from action keys", () => {
    const busyPluginIds = pluginsPaneTestApi.buildBusyPluginIdSet(
      new Set([
        "install",
        "rescan",
        "enable:alpha.plugin",
        "disable:beta.plugin",
        "rollback:alpha.plugin",
      ]),
    );

    expect([...busyPluginIds].sort()).toEqual(["alpha.plugin", "beta.plugin"]);
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
    const blockedStatusIndex = pluginsPaneTestApi.buildCapabilityStatusIndex({
      requestedCapabilities: blockedStatusEntry.requestedCapabilities,
      effectiveCapabilities: blockedStatusEntry.effectiveCapabilities,
      blockedCapabilities: blockedStatusEntry.blockedCapabilities,
      capabilityList: ["registerCommand"],
    });
    expect(
      blockedStatusIndex.capabilityStatusByCapability.get("registerCommand"),
    ).toBe("blocked");
    expect(
      blockedStatusIndex.blockedReasonByCapability.get("registerCommand"),
    ).toBe("mode_policy");

    const requestedUnavailableStatusEntry = buildPluginStatusEntry({
      requestedCapabilities: ["registerPane"],
      effectiveCapabilities: [],
      blockedCapabilities: [],
    });
    const requestedUnavailableStatusIndex =
      pluginsPaneTestApi.buildCapabilityStatusIndex({
        requestedCapabilities:
          requestedUnavailableStatusEntry.requestedCapabilities,
        effectiveCapabilities:
          requestedUnavailableStatusEntry.effectiveCapabilities,
        blockedCapabilities:
          requestedUnavailableStatusEntry.blockedCapabilities,
        capabilityList: ["registerPane"],
      });
    expect(
      requestedUnavailableStatusIndex.capabilityStatusByCapability.get(
        "registerPane",
      ),
    ).toBe("requested_unavailable");
  });

  it("builds capability status indexes with shared blocked-reason mapping", () => {
    const capabilityStatusIndex = pluginsPaneTestApi.buildCapabilityStatusIndex(
      {
        requestedCapabilities: [
          "registerCommand",
          "registerPane",
          "writeWorkspacePlugins",
        ],
        effectiveCapabilities: ["registerPane"],
        blockedCapabilities: [
          {
            capability: "registerCommand",
            reason: "mode_policy",
          },
        ],
        capabilityList: [
          "registerCommand",
          "registerPane",
          "writeWorkspacePlugins",
          "registerTopNavBarItem",
        ],
      },
    );

    expect(
      capabilityStatusIndex.capabilityStatusByCapability.get("registerCommand"),
    ).toBe("blocked");
    expect(
      capabilityStatusIndex.capabilityStatusByCapability.get("registerPane"),
    ).toBe("effective");
    expect(
      capabilityStatusIndex.capabilityStatusByCapability.get(
        "writeWorkspacePlugins",
      ),
    ).toBe("requested_unavailable");
    expect(
      capabilityStatusIndex.capabilityStatusByCapability.get(
        "registerTopNavBarItem",
      ),
    ).toBe("not_requested");
    expect(
      capabilityStatusIndex.blockedReasonByCapability.get("registerCommand"),
    ).toBe("mode_policy");
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
    expect(
      pluginsPaneTestApi.buildCapabilityUnavailableMessage({
        capability: "registerContextMenu",
        status: "blocked",
        reason: "host_policy",
        serverMode: "ide",
      }),
    ).toBe("registerContextMenu is blocked (host_policy).");
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

  it("formats plugin config drafts as stable JSON objects", () => {
    expect(
      pluginsPaneTestApi.formatPluginConfigDraft({
        enabled: true,
        nested: { level: 2 },
      }),
    ).toContain('"enabled": true');
    expect(pluginsPaneTestApi.formatPluginConfigDraft("not-an-object")).toBe(
      "{}",
    );
  });

  it("resolves plugin config field presentation from schema defaults and text", () => {
    expect(
      pluginsPaneTestApi.resolvePluginConfigFieldPresentation(
        {
          key: "enabled",
          required: true,
          schema: {
            default: true,
            title: " Enabled ",
            description: " Turns the plugin on. ",
          },
        },
        {},
      ),
    ).toEqual({
      value: true,
      displayLabelText: "Enabled *",
      descriptionText: "Turns the plugin on.",
    });

    expect(
      pluginsPaneTestApi.resolvePluginConfigFieldPresentation(
        {
          key: "mode",
          required: false,
          schema: {
            title: "   ",
            description: "",
          },
        },
        { mode: "manual" },
      ),
    ).toEqual({
      value: "manual",
      displayLabelText: "mode",
      descriptionText: null,
    });
  });

  it("extracts plugin action error detail from standard and structured fallback payloads", () => {
    expect(
      pluginsPaneTestApi.getPluginActionErrorDetail({
        detail: "Plugin install failed.",
      }),
    ).toBe("Plugin install failed.");

    expect(
      pluginsPaneTestApi.getPluginActionErrorDetail({
        detail: {
          code: "plugin_conflict",
          message: "",
        },
      }),
    ).toBe("plugin_conflict - ");

    expect(
      pluginsPaneTestApi.getPluginActionErrorDetail({
        detail: {
          code: "plugin_conflict",
          message: 42,
        },
      }),
    ).toBeNull();
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
