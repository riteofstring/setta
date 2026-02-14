import {
  getPluginSectionFallbackReason,
  getPluginSectionKindsForCreateMenu,
  PluginFrontendErrorCodeEnum,
  pluginRuntimeTestApi,
  PluginSectionFallbackReasonEnum,
  refreshPluginRuntime,
  resetPluginRuntimeStoreForTests,
  toPluginSectionKindKey,
  usePluginRuntimeStore,
  type RegisteredPluginSectionKind,
} from "plugins/runtime";
import { useShareSession } from "state/definitions";
import * as generatedEndpoints from "utils/generatedEndpoints";
import { C_ADDRESSES } from "utils/c_addresses";
import {
  createPluginListEntry,
  createPluginStatusEntry,
  PluginRuntimeStateEnum,
  type PluginListResponse,
  type PluginRestartCapability,
  type PluginListEntry,
  type PluginStatusResponse,
  type PluginStatusEntry,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function buildPluginListResponse(
  plugins: PluginListEntry[],
  overrides: Partial<PluginListResponse> = {},
): PluginListResponse {
  return {
    schemaVersion: 1,
    serverMode: "ide",
    restartCapability: {
      mode: "manual",
      command: "setta",
      reason: "Programmatic restart is not available in this runtime.",
    } as PluginRestartCapability,
    plugins,
    ...overrides,
  };
}

function buildPluginStatusResponse(
  plugins: PluginStatusEntry[],
  overrides: Partial<PluginStatusResponse> = {},
): PluginStatusResponse {
  return {
    schemaVersion: 1,
    serverMode: "ide",
    plugins,
    ...overrides,
  };
}

describe("plugin runtime helpers", () => {
  beforeEach(() => {
    resetPluginRuntimeStoreForTests();
    vi.restoreAllMocks();
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
    });
  });

  afterEach(() => {
    resetPluginRuntimeStoreForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
    });
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

  it("returns a stable sorted create-menu projection for large section-kind catalogs", () => {
    const sectionKinds: Record<string, RegisteredPluginSectionKind> = {};
    for (let index = 0; index < 150; index += 1) {
      const pluginId = index % 2 === 0 ? "acme.plugin" : "beta.plugin";
      const kind = `kind-${String(index).padStart(3, "0")}`;
      sectionKinds[toPluginSectionKindKey(pluginId, kind)] = {
        pluginId,
        kind,
        title: `Title ${String(150 - index).padStart(3, "0")}`,
        initialData: { index },
        renderer: {
          mount: () => undefined,
        },
      };
    }

    usePluginRuntimeStore.setState({
      sectionKindsByKey: sectionKinds,
    });

    const projected = getPluginSectionKindsForCreateMenu();
    expect(projected).toHaveLength(150);
    expect(projected[0]).toEqual({
      pluginId: "beta.plugin",
      kind: "kind-149",
      title: "Title 001",
      initialData: { index: 149 },
    });
    expect(projected[149]).toEqual({
      pluginId: "acme.plugin",
      kind: "kind-000",
      title: "Title 150",
      initialData: { index: 0 },
    });
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

  it("registers top nav bar items when capability is effective", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(host) {\n  host.registerTopNavBarItem({ id: 'quick-action', label: 'Quick Action', onClick() {} });\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerTopNavBarItem"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error).toBeNull();
    expect(result?.registryDelta?.topNavBarItems["acme.plugin"]?.[0]?.id).toBe(
      "quick-action",
    );
  });

  it("rejects section-kind registration when capability is not effective", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(host) {\n  host.registerSectionKind({ kind: 'widget', title: 'Widget', renderer: { mount() {} } });\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: [],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error?.code).toBe(PluginFrontendErrorCodeEnum.CapabilityDenied);
  });

  it("rejects invalid command registrations", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(host) {\n  host.registerCommand({ id: 'invalid', title: 'Invalid', run: 123 });\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerCommand"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error?.code).toBe(PluginFrontendErrorCodeEnum.RegistrationInvalid);
  });

  it("rejects invalid top-nav registrations", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(host) {\n  host.registerTopNavBarItem({ id: 'bad-order', label: 'Bad', order: Number.NaN, onClick() {} });\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerTopNavBarItem"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error?.code).toBe(PluginFrontendErrorCodeEnum.RegistrationInvalid);
  });

  it("reports runtime error when plugins list request fails", async () => {
    vi.spyOn(generatedEndpoints, "route_plugins_list").mockResolvedValue({
      data: undefined,
      status: 500,
      hasResponse: true,
    });
    vi.spyOn(generatedEndpoints, "route_plugins_status").mockResolvedValue({
      data: buildPluginStatusResponse([]),
      status: 200,
      hasResponse: true,
    });

    await refreshPluginRuntime();

    const state = usePluginRuntimeStore.getState();
    expect(state.status).toBe("error");
    expect(state.statusMessage).toBe("Failed to fetch plugins list: status 500.");
  });

  it("reports runtime error when plugins status request fails without response", async () => {
    vi.spyOn(generatedEndpoints, "route_plugins_list").mockResolvedValue({
      data: buildPluginListResponse([]),
      status: 200,
      hasResponse: true,
    });
    vi.spyOn(generatedEndpoints, "route_plugins_status").mockResolvedValue({
      data: undefined,
      status: undefined,
      hasResponse: false,
    });

    await refreshPluginRuntime();

    const state = usePluginRuntimeStore.getState();
    expect(state.status).toBe("error");
    expect(state.statusMessage).toBe(
      "Failed to fetch plugins status: network error.",
    );
  });

  it("prefers non-shadowed status entries as the primary plugin status", async () => {
    const plugin = buildPluginListEntry({});
    vi.spyOn(generatedEndpoints, "route_plugins_list").mockResolvedValue({
      data: buildPluginListResponse([plugin]),
      status: 200,
      hasResponse: true,
    });
    vi.spyOn(generatedEndpoints, "route_plugins_status").mockResolvedValue({
      data: buildPluginStatusResponse([
        buildPluginStatusEntry({
          pluginId: "acme.plugin",
          sourcePath: "/tmp/shadowed",
          shadowedBySourcePath: "/tmp/primary",
        }),
        buildPluginStatusEntry({
          pluginId: "acme.plugin",
          sourcePath: "/tmp/primary",
          shadowedBySourcePath: null,
        }),
      ]),
      status: 200,
      hasResponse: true,
    });

    await refreshPluginRuntime();

    const state = usePluginRuntimeStore.getState();
    expect(state.pluginStatusById["acme.plugin"]?.sourcePath).toBe(
      "/tmp/primary",
    );
  });

  it("deduplicates concurrent refreshPluginRuntime calls", async () => {
    let releaseRequests: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseRequests = resolve;
    });
    let listCalls = 0;
    let statusCalls = 0;

    vi.spyOn(generatedEndpoints, "route_plugins_list").mockImplementation(
      async () => {
        listCalls += 1;
        await gate;
        return {
          data: buildPluginListResponse([]),
          status: 200,
          hasResponse: true,
        };
      },
    );
    vi.spyOn(generatedEndpoints, "route_plugins_status").mockImplementation(
      async () => {
        statusCalls += 1;
        await gate;
        return {
          data: buildPluginStatusResponse([]),
          status: 200,
          hasResponse: true,
        };
      },
    );

    const first = refreshPluginRuntime();
    const second = refreshPluginRuntime();
    const third = refreshPluginRuntime();
    await Promise.resolve();
    expect(listCalls).toBe(1);
    expect(statusCalls).toBe(1);

    if (releaseRequests) {
      releaseRequests();
    }
    await Promise.all([first, second, third]);
    expect(usePluginRuntimeStore.getState().status).toBe("loaded");
  });

  it("apiFetch normalizes plugin paths and attaches deployment share headers", async () => {
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-123",
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  void host.apiFetch('health');\n" +
          "  void host.apiFetch('/status', { headers: { 'X-Custom': 'yes' } });\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "share",
    );

    expect(result?.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/plugins/acme.plugin/health`,
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/plugins/acme.plugin/status`,
    );
    const firstHeaders = new Headers(
      (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    );
    const secondHeaders = new Headers(
      (fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(firstHeaders.get("X-Share-Session-Id")).toBe("share-session-123");
    expect(secondHeaders.get("X-Share-Session-Id")).toBe("share-session-123");
    expect(secondHeaders.get("X-Custom")).toBe("yes");
  });

  it("manages plugin style links across repeated and null-style loads", async () => {
    type FakeLinkElement = {
      rel: string;
      href: string;
      dataset: Record<string, string>;
      removed: boolean;
      remove: () => void;
    };
    const fakeLinks: FakeLinkElement[] = [];
    vi.stubGlobal("document", {
      head: {
        append: (node: FakeLinkElement) => {
          fakeLinks.push(node);
        },
      },
      createElement: (_tag: string): FakeLinkElement => {
        const link: FakeLinkElement = {
          rel: "",
          href: "",
          dataset: {},
          removed: false,
          remove: () => {
            link.removed = true;
          },
        };
        return link;
      },
    });

    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(_host) {}\n",
      );
    const pluginWithStyle = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: "/plugins/acme.plugin/frontend/dist/index.css?v=1",
      },
    });

    const firstLoad = await pluginRuntimeTestApi.loadPluginFrontendModule(
      pluginWithStyle,
      "ide",
    );
    expect(firstLoad?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(1);

    const secondLoad = await pluginRuntimeTestApi.loadPluginFrontendModule(
      pluginWithStyle,
      "ide",
    );
    expect(secondLoad?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(1);

    const pluginWithoutStyle = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
    });
    const noStyleLoad = await pluginRuntimeTestApi.loadPluginFrontendModule(
      pluginWithoutStyle,
      "ide",
    );
    expect(noStyleLoad?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(0);
  });

  it("removes stale plugin styles when a plugin is removed from plugin list", async () => {
    type FakeLinkElement = {
      rel: string;
      href: string;
      dataset: Record<string, string>;
      removed: boolean;
      remove: () => void;
    };
    const fakeLinks: FakeLinkElement[] = [];
    vi.stubGlobal("document", {
      head: {
        append: (node: FakeLinkElement) => {
          fakeLinks.push(node);
        },
      },
      createElement: (_tag: string): FakeLinkElement => {
        const link: FakeLinkElement = {
          rel: "",
          href: "",
          dataset: {},
          removed: false,
          remove: () => {
            link.removed = true;
          },
        };
        return link;
      },
    });

    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(_host) {}\n",
      );
    const pluginWithStyle = buildPluginListEntry({
      pluginId: "acme.plugin",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: "/plugins/acme.plugin/frontend/dist/index.css?v=digest-a",
      },
    });
    const pluginStatus = buildPluginStatusEntry({
      pluginId: "acme.plugin",
    });

    let listPayload = buildPluginListResponse([pluginWithStyle]);
    let statusPayload = buildPluginStatusResponse([pluginStatus]);
    vi.spyOn(generatedEndpoints, "route_plugins_list").mockImplementation(
      async () => ({
        data: listPayload,
        status: 200,
        hasResponse: true,
      }),
    );
    vi.spyOn(generatedEndpoints, "route_plugins_status").mockImplementation(
      async () => ({
        data: statusPayload,
        status: 200,
        hasResponse: true,
      }),
    );

    await refreshPluginRuntime();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(1);

    listPayload = buildPluginListResponse([]);
    statusPayload = buildPluginStatusResponse([]);
    await refreshPluginRuntime();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(0);
  });

  it("returns frontend_load_failed fallback when plugin is active without frontend errors", () => {
    usePluginRuntimeStore.setState({
      pluginStatusById: {
        "acme.plugin": buildPluginStatusEntry({
          state: PluginRuntimeStateEnum.active,
          requestedCapabilities: ["registerSectionKinds"],
          effectiveCapabilities: ["registerSectionKinds"],
          blockedCapabilities: [],
        }),
      },
      frontendErrorsByPluginId: {},
    });

    expect(getPluginSectionFallbackReason("acme.plugin", "kind")).toBe(
      PluginSectionFallbackReasonEnum.frontend_load_failed,
    );
  });
});
