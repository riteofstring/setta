import {
  buildPluginRestartActionPlan,
  getRestartRequiredPluginIds,
} from "plugins/restart";
import {
  createPluginListEntry,
  type PluginListEntry,
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

describe("plugin restart helpers", () => {
  it("collects and sorts restart-required plugin ids", () => {
    const ids = getRestartRequiredPluginIds([
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

  it("normalizes manual and unavailable restart plans", () => {
    const manual = buildPluginRestartActionPlan({
      mode: "manual",
      command: "",
      reason: "No daemon restart support",
    });

    expect(manual).toEqual({
      mode: "manual",
      command: "setta",
      reason: "No daemon restart support",
      message: "Manual restart required: setta. No daemon restart support",
    });

    const unavailable = buildPluginRestartActionPlan(null);
    expect(unavailable.mode).toBe("unavailable");
  });
});
