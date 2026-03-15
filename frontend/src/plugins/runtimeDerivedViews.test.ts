import {
  createPluginListEntry,
  createPluginStatusEntry,
  PluginRuntimeStateEnum,
  type PluginListEntry,
  type PluginStatusEntry,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  deriveSortedRuntimeViews,
  mapPluginListById,
  mapPrimaryStatusByPluginId,
  mapStatusEntries,
} from "./runtimeDerivedViews";

function buildPluginListEntry(
  overrides: Partial<PluginListEntry> = {},
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
  overrides: Partial<PluginStatusEntry> = {},
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
    runtimePayloadDigestSha256: "digest-acme-plugin",
    restartRequired: false,
    errors: [],
    ...overrides,
  });
}

describe("runtimeDerivedViews", () => {
  it("reuses plugin list entries and capability arrays when payload values are unchanged", () => {
    const firstEntry = buildPluginListEntry({
      effectiveCapabilities: ["registerPane", "registerCommand"],
      config: {
        hasSchema: true,
        schemaJson: {
          type: "object",
          properties: {
            theme: {
              type: "string",
            },
          },
        },
        currentConfig: {
          theme: "light",
        },
      },
    });
    const secondPayload = buildPluginListEntry({
      ...firstEntry,
      frontend: { ...firstEntry.frontend },
      content: { ...firstEntry.content },
      config: {
        hasSchema: true,
        schemaJson: {
          ...(firstEntry.config.schemaJson as Record<string, unknown>),
        },
        currentConfig: {
          ...(firstEntry.config.currentConfig as Record<string, unknown>),
        },
      },
      effectiveCapabilities: [...firstEntry.effectiveCapabilities],
    });

    const firstResult = mapPluginListById([firstEntry], {});
    const secondResult = mapPluginListById([secondPayload], firstResult);

    expect(secondResult[firstEntry.pluginId]).toBe(
      firstResult[firstEntry.pluginId],
    );
    expect(secondResult[firstEntry.pluginId]?.effectiveCapabilities).toBe(
      firstResult[firstEntry.pluginId]?.effectiveCapabilities,
    );
  });

  it("replaces plugin list entries when config digests diverge", () => {
    const firstEntry = buildPluginListEntry({
      config: {
        hasSchema: true,
        schemaJson: {
          type: "object",
          properties: {
            theme: {
              type: "string",
            },
          },
        },
        currentConfig: {
          theme: "light",
        },
        schemaJsonDigestSha256: "schema-digest-a",
        currentConfigDigestSha256: "config-digest-a",
      } as PluginListEntry["config"],
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const secondPayload = buildPluginListEntry({
      ...firstEntry,
      config: {
        hasSchema: true,
        schemaJson: firstEntry.config.schemaJson,
        currentConfig: firstEntry.config.currentConfig,
        schemaJsonDigestSha256: "schema-digest-a",
        currentConfigDigestSha256: "config-digest-b",
      } as PluginListEntry["config"],
      effectiveCapabilities: [...firstEntry.effectiveCapabilities],
    });

    const firstResult = mapPluginListById([firstEntry], {});
    const secondResult = mapPluginListById([secondPayload], firstResult);

    expect(secondResult[firstEntry.pluginId]).not.toBe(
      firstResult[firstEntry.pluginId],
    );
  });

  it("reuses the previous status array when every stable status entry matches", () => {
    const firstStatus = buildPluginStatusEntry();
    const secondStatus = buildPluginStatusEntry({
      pluginId: "beta.plugin",
      sourcePath: "/tmp/beta.plugin",
      runtimePayloadDigestSha256: "digest-beta-plugin",
    });
    const previousEntries = [firstStatus, secondStatus];
    const nextEntries = [
      buildPluginStatusEntry({
        pluginId: firstStatus.pluginId,
        sourcePath: firstStatus.sourcePath,
        runtimePayloadDigestSha256: firstStatus.runtimePayloadDigestSha256,
      }),
      buildPluginStatusEntry({
        pluginId: secondStatus.pluginId,
        sourcePath: secondStatus.sourcePath,
        runtimePayloadDigestSha256: secondStatus.runtimePayloadDigestSha256,
      }),
    ];

    const mappedEntries = mapStatusEntries(nextEntries, previousEntries);

    expect(mappedEntries).toBe(previousEntries);
    expect(mappedEntries[0]).toBe(firstStatus);
    expect(mappedEntries[1]).toBe(secondStatus);
  });

  it("prefers the unshadowed status entry for each plugin id", () => {
    const shadowed = buildPluginStatusEntry({
      pluginId: "acme.plugin",
      sourcePath: "/tmp/shadowed",
      shadowedBySourcePath: "/tmp/primary",
    });
    const primary = buildPluginStatusEntry({
      pluginId: "acme.plugin",
      sourcePath: "/tmp/primary",
      shadowedBySourcePath: null,
    });

    const mapped = mapPrimaryStatusByPluginId([shadowed, primary], {});

    expect(mapped["acme.plugin"]).toBe(primary);
  });

  it("sorts derived runtime views and reuses previous arrays when references are unchanged", () => {
    const betaPlugin = buildPluginListEntry({
      pluginId: "beta.plugin",
      effectiveCapabilities: ["registerPane"],
    });
    const alphaPlugin = buildPluginListEntry({
      pluginId: "alpha.plugin",
      effectiveCapabilities: ["registerPane"],
    });
    const pluginListById = {
      "beta.plugin": betaPlugin,
      "alpha.plugin": alphaPlugin,
    };
    const registryAccumulator = {
      sectionKinds: {
        "alpha.plugin::kind-b": {
          pluginId: "alpha.plugin",
          kind: "kind-b",
          title: "Shared",
          renderer: { mount: () => undefined },
        },
        "beta.plugin::kind-a": {
          pluginId: "beta.plugin",
          kind: "kind-a",
          title: "Shared",
          renderer: { mount: () => undefined },
        },
      },
      panes: {
        "beta.plugin": [
          {
            pluginId: "beta.plugin",
            id: "pane-z",
            title: "Alpha",
            renderer: { mount: () => undefined },
          },
        ],
        "alpha.plugin": [
          {
            pluginId: "alpha.plugin",
            id: "pane-a",
            title: "Alpha",
            renderer: { mount: () => undefined },
          },
        ],
      },
      commands: {
        "beta.plugin": [
          {
            pluginId: "beta.plugin",
            id: "cmd-z",
            title: "Action",
            run: () => undefined,
          },
        ],
        "alpha.plugin": [
          {
            pluginId: "alpha.plugin",
            id: "cmd-a",
            title: "Action",
            run: () => undefined,
          },
        ],
      },
      topNavBarItems: {
        "beta.plugin": [
          {
            pluginId: "beta.plugin",
            id: "nav-z",
            label: "Deploy",
            order: 1,
            onClick: () => undefined,
          },
        ],
        "alpha.plugin": [
          {
            pluginId: "alpha.plugin",
            id: "nav-a",
            label: "Deploy",
            order: 1,
            onClick: () => undefined,
          },
        ],
      },
    };

    const firstDerived = deriveSortedRuntimeViews({
      previousState: {
        sortedPluginListEntries: [],
        sectionKindsByKey: {},
        sortedSectionKinds: [],
        panesByPluginId: {},
        sortedPaneTabs: [],
        commandsByPluginId: {},
        sortedCommands: [],
        topNavBarItemsByPluginId: {},
        sortedTopNavBarItems: [],
      },
      orderedPlugins: [betaPlugin, alphaPlugin],
      pluginListById,
      registryAccumulator,
    });

    expect(
      firstDerived.sortedPluginListEntries.map((entry) => entry.pluginId),
    ).toEqual(["beta.plugin", "alpha.plugin"]);
    expect(
      firstDerived.sortedSectionKinds.map(
        (entry) => `${entry.title}:${entry.pluginId}:${entry.kind}`,
      ),
    ).toEqual(["Shared:alpha.plugin:kind-b", "Shared:beta.plugin:kind-a"]);
    expect(
      firstDerived.sortedPaneTabs.map(
        (entry) => `${entry.title}:${entry.pluginId}:${entry.paneId}`,
      ),
    ).toEqual(["Alpha:alpha.plugin:pane-a", "Alpha:beta.plugin:pane-z"]);
    expect(
      firstDerived.sortedCommands.map(
        (entry) => `${entry.title}:${entry.pluginId}:${entry.id}`,
      ),
    ).toEqual(["Action:alpha.plugin:cmd-a", "Action:beta.plugin:cmd-z"]);
    expect(
      firstDerived.sortedTopNavBarItems.map(
        (entry) =>
          `${entry.order}:${entry.label}:${entry.pluginId}:${entry.id}`,
      ),
    ).toEqual(["1:Deploy:alpha.plugin:nav-a", "1:Deploy:beta.plugin:nav-z"]);

    const secondDerived = deriveSortedRuntimeViews({
      previousState: {
        sortedPluginListEntries: firstDerived.sortedPluginListEntries,
        sectionKindsByKey: registryAccumulator.sectionKinds,
        sortedSectionKinds: firstDerived.sortedSectionKinds,
        panesByPluginId: registryAccumulator.panes,
        sortedPaneTabs: firstDerived.sortedPaneTabs,
        commandsByPluginId: registryAccumulator.commands,
        sortedCommands: firstDerived.sortedCommands,
        topNavBarItemsByPluginId: registryAccumulator.topNavBarItems,
        sortedTopNavBarItems: firstDerived.sortedTopNavBarItems,
      },
      orderedPlugins: [betaPlugin, alphaPlugin],
      pluginListById,
      registryAccumulator,
    });

    expect(secondDerived.sortedPluginListEntries).toBe(
      firstDerived.sortedPluginListEntries,
    );
    expect(secondDerived.sortedSectionKinds).toBe(
      firstDerived.sortedSectionKinds,
    );
    expect(secondDerived.sortedPaneTabs).toBe(firstDerived.sortedPaneTabs);
    expect(secondDerived.sortedCommands).toBe(firstDerived.sortedCommands);
    expect(secondDerived.sortedTopNavBarItems).toBe(
      firstDerived.sortedTopNavBarItems,
    );
  });
});
