import {
  getPluginSectionFallbackReason,
  getPluginSectionKindsForCreateMenu,
  PluginFrontendErrorCodeEnum,
  pluginRuntimeTestApi,
  PluginSectionFallbackReasonEnum,
  resetPluginRuntimeStoreForTests,
  toPluginSectionKindKey,
  usePluginRuntimeStore,
  type RegisteredPluginSectionKind,
} from "plugins/runtime";
import {
  createPluginListEntry,
  createPluginStatusEntry,
  PluginRuntimeStateEnum,
  type PluginListEntry,
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

  it("surfaces API version mismatch frontend load errors", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 999;\nexport function register(host) { void host; }\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerPane"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.ApiVersionMismatch,
    );
  });

  it("surfaces registration-invalid frontend load errors", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(host) {\n  host.registerPane({ id: '', title: 'Broken', renderer: { mount() {} } });\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerPane"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });

  it("keeps unknown frontend load errors mapped to load-failed", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(_host) {\n  throw new Error('boom');\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerPane"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.FrontendLoadFailed,
    );
  });

  it("rejects async frontend register functions", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport async function register(_host) {\n  return;\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerPane"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });

  it("rejects duplicate pane ids for the same plugin", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(host) {\n  host.registerPane({ id: 'dup', title: 'A', renderer: { mount() {} } });\n  host.registerPane({ id: 'dup', title: 'B', renderer: { mount() {} } });\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerPane"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });

  it("registers pane icon when a supported icon name is provided", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(host) {\n  host.registerPane({ id: 'pane', title: 'Pane', icon: 'dashboard', renderer: { mount() {} } });\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerPane"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error).toBeNull();
    expect(result?.registryDelta?.panes["acme.plugin"]?.[0]?.icon).toBe(
      "dashboard",
    );
  });

  it("rejects pane icon values outside the supported icon set", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(host) {\n  host.registerPane({ id: 'pane', title: 'Pane', icon: 'spaceship', renderer: { mount() {} } });\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerPane"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });
});
