import {
  type RegisteredPluginSectionKind,
  getPluginSectionFallbackReason,
  getPluginSectionKindsForCreateMenu,
  PluginSectionFallbackReasonEnum,
  resetPluginRuntimeStoreForTests,
  toPluginSectionKindKey,
  usePluginRuntimeStore,
} from "plugins/runtime";
import {
  createPluginStatusEntry,
  PluginRuntimeStateEnum,
  type PluginStatusEntry,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

describe("plugin runtime helpers", () => {
  beforeEach(() => {
    resetPluginRuntimeStoreForTests();
  });

  afterEach(() => {
    resetPluginRuntimeStoreForTests();
  });

  it("builds deterministic section-kind keys", () => {
    expect(toPluginSectionKindKey("acme.tools", "widget")).toBe(
      "acme.tools::widget",
    );
  });

  it("returns plugin_not_installed when status entry is missing", () => {
    expect(getPluginSectionFallbackReason("missing.plugin", "kind")).toBe(
      PluginSectionFallbackReasonEnum.plugin_not_installed,
    );
  });

  it("returns plugin_disabled when plugin status is disabled", () => {
    usePluginRuntimeStore.setState({
      pluginStatusById: {
        "acme.plugin": buildPluginStatusEntry({
          state: PluginRuntimeStateEnum.disabled,
        }),
      },
    });
    expect(getPluginSectionFallbackReason("acme.plugin", "kind")).toBe(
      PluginSectionFallbackReasonEnum.plugin_disabled,
    );
  });

  it("returns mode_blocked when section-kind capability is blocked", () => {
    usePluginRuntimeStore.setState({
      pluginStatusById: {
        "acme.plugin": buildPluginStatusEntry({
          requestedCapabilities: ["registerSectionKinds"],
          effectiveCapabilities: [],
          blockedCapabilities: [
            {
              capability: "registerSectionKinds",
              reason: "mode_policy",
            },
          ],
        }),
      },
    });
    expect(getPluginSectionFallbackReason("acme.plugin", "kind")).toBe(
      PluginSectionFallbackReasonEnum.mode_blocked,
    );
  });

  it("returns frontend_load_failed when frontend registration failed", () => {
    usePluginRuntimeStore.setState({
      pluginStatusById: {
        "acme.plugin": buildPluginStatusEntry({
          requestedCapabilities: ["registerSectionKinds"],
          effectiveCapabilities: ["registerSectionKinds"],
        }),
      },
      frontendErrorsByPluginId: {
        "acme.plugin": {
          code: "PLUGIN_FRONTEND_LOAD_FAILED",
          message: "import failed",
        },
      },
    });
    expect(getPluginSectionFallbackReason("acme.plugin", "kind")).toBe(
      PluginSectionFallbackReasonEnum.frontend_load_failed,
    );
  });

  it("returns sorted plugin section kinds for create menu", () => {
    usePluginRuntimeStore.setState({
      sectionKindsByKey: {
        [toPluginSectionKindKey("acme.plugin", "b")]: {
          pluginId: "acme.plugin",
          kind: "b",
          title: "Zeta Widget",
          renderer: {
            mount: () => undefined,
          },
        } as RegisteredPluginSectionKind,
        [toPluginSectionKindKey("acme.plugin", "a")]: {
          pluginId: "acme.plugin",
          kind: "a",
          title: "Alpha Widget",
          initialData: { enabled: true },
          renderer: {
            mount: () => undefined,
          },
        } as RegisteredPluginSectionKind,
      },
    });

    expect(getPluginSectionKindsForCreateMenu()).toEqual([
      {
        pluginId: "acme.plugin",
        kind: "a",
        title: "Alpha Widget",
        initialData: { enabled: true },
      },
      {
        pluginId: "acme.plugin",
        kind: "b",
        title: "Zeta Widget",
        initialData: {},
      },
    ]);
  });
});
