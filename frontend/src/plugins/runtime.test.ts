import * as openAPI from "openapi/http";
import {
  usePluginRuntimeStore,
  usePluginSectionKind,
  usePluginSectionKinds,
  type RegisteredPluginSectionKind,
} from "plugins/runtime";
import {
  indexSectionKindKeysByPluginId,
  loadPluginFrontendModule,
} from "plugins/runtimeInternal";
import {
  computePluginSectionFallbackReason,
  PluginFrontendErrorCodeEnum,
  toPluginSectionKindKey,
} from "plugins/runtimeShared";
import { loadProjectState } from "state/actions/project/loadProject";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState, useShareSession } from "state/definitions";
import {
  createDictSectionImpl,
  PluginRuntimeStateEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPluginListEntry,
  buildPluginRuntimeProjectState,
  buildPluginStatusEntry,
  getCapturedPluginHost,
  readPluginRuntimeHookValue,
  resetPluginRuntimeStateForTests,
  RuntimeTestWebSocket,
  seedRuntimePluginSectionState,
  type CapturedPluginHost,
} from "./runtime.testHelpers";

describe("plugin runtime helpers", () => {
  beforeEach(() => {
    resetPluginRuntimeStateForTests();
    vi.restoreAllMocks();
    vi.spyOn(openAPI, "getPluginsRuntime").mockRejectedValue(
      new Error("network error"),
    );
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-before-each";
      state.projectConfig.activeIds = [];
      state.projectConfig.sectionVariantMap = {};
      state.sections = {};
      state.sectionImpls = {};
      state.sectionVariants = {};
      state.previewSectionVariantMap = {};
      state.pluginData = {};
    });
    useActiveSectionUI.setState({
      activeIds: [],
      pendingBackendSyncOpIds: [],
      scheduledBackendSync: null,
    });
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
    });
    RuntimeTestWebSocket.reset();
  });
  afterEach(() => {
    resetPluginRuntimeStateForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const globalScope = globalThis as {
      __settaCapturedPluginHost?: CapturedPluginHost;
      __settaCleanupProbe?: {
        callCount: number;
      };
      __settaRevealHandlerSpy?: (...args: unknown[]) => unknown;
      __settaWatchCodeRegisterCalls?: number;
    };
    delete globalScope.__settaCapturedPluginHost;
    delete globalScope.__settaCleanupProbe;
    delete globalScope.__settaRevealHandlerSpy;
    delete globalScope.__settaWatchCodeRegisterCalls;
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-after-each";
      state.projectConfig.activeIds = [];
      state.projectConfig.sectionVariantMap = {};
      state.sections = {};
      state.sectionImpls = {};
      state.sectionVariants = {};
      state.previewSectionVariantMap = {};
    });
    useActiveSectionUI.setState({
      activeIds: [],
      pendingBackendSyncOpIds: [],
      scheduledBackendSync: null,
    });
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
    });
    RuntimeTestWebSocket.reset();
  });
  it("builds deterministic section-kind keys", () => {
    expect(toPluginSectionKindKey("acme.tools", "widget")).toBe(
      "acme.tools::widget",
    );
  });
  it("returns plugin_not_installed when status entry is missing", () => {
    expect(
      computePluginSectionFallbackReason(
        usePluginRuntimeStore.getState(),
        "missing.plugin",
        "kind",
      ),
    ).toBe("plugin_not_installed");
  });
  it("computes fallback reason from explicit runtime state snapshots", () => {
    const snapshot = usePluginRuntimeStore.getState();
    expect(
      computePluginSectionFallbackReason(snapshot, "missing.plugin", "kind"),
    ).toBe("plugin_not_installed");
  });
  it("returns plugin_disabled when plugin status is disabled", () => {
    usePluginRuntimeStore.setState({
      pluginStatusById: {
        "acme.plugin": buildPluginStatusEntry({
          state: PluginRuntimeStateEnum.disabled,
        }),
      },
    });
    expect(
      computePluginSectionFallbackReason(
        usePluginRuntimeStore.getState(),
        "acme.plugin",
        "kind",
      ),
    ).toBe("plugin_disabled");
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
    expect(
      computePluginSectionFallbackReason(
        usePluginRuntimeStore.getState(),
        "acme.plugin",
        "kind",
      ),
    ).toBe("mode_blocked");
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
    expect(
      computePluginSectionFallbackReason(
        usePluginRuntimeStore.getState(),
        "acme.plugin",
        "kind",
      ),
    ).toBe("frontend_load_failed");
  });
  it("indexes section-kind keys by plugin id for incremental refresh reuse", () => {
    const sectionKindsByKey: Record<string, RegisteredPluginSectionKind> = {
      [toPluginSectionKindKey("alpha.plugin", "one")]: {
        pluginId: "alpha.plugin",
        kind: "one",
        title: "Alpha One",
        renderer: { mount: () => undefined },
      },
      [toPluginSectionKindKey("alpha.plugin", "two")]: {
        pluginId: "alpha.plugin",
        kind: "two",
        title: "Alpha Two",
        renderer: { mount: () => undefined },
      },
      [toPluginSectionKindKey("beta.plugin", "main")]: {
        pluginId: "beta.plugin",
        kind: "main",
        title: "Beta Main",
        renderer: { mount: () => undefined },
      },
    };
    expect(indexSectionKindKeysByPluginId(sectionKindsByKey)).toEqual({
      "alpha.plugin": [
        toPluginSectionKindKey("alpha.plugin", "one"),
        toPluginSectionKindKey("alpha.plugin", "two"),
      ],
      "beta.plugin": [toPluginSectionKindKey("beta.plugin", "main")],
    });
  });
  it("returns cloned project-state snapshots through the plugin host", async () => {
    const sectionId = "section-runtime-clone";
    seedRuntimePluginSectionState(sectionId);
    useActiveSectionUI.setState({ activeIds: [sectionId] });
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  globalThis.__settaCapturedPluginHost = host;\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["readProjectState"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    const activeIdsSnapshot = host.readProjectState({
      kind: "activeSectionIds",
    }) as string[];
    activeIdsSnapshot.push("mutated-client-only");
    expect(
      host.readProjectState({
        kind: "activeSectionIds",
      }) as string[],
    ).toEqual([sectionId]);
    const projectConfigSnapshot = host.readProjectState({
      kind: "projectConfig",
    }) as {
      id: string;
    };
    projectConfigSnapshot.id = "mutated-client-only";
    expect(
      (
        host.readProjectState({
          kind: "projectConfig",
        }) as {
          id: string;
        }
      ).id,
    ).toBe("project-config-plugin-initial");
  });
  it("reuses section snapshot entries for unchanged sections through subscribeProjectState", async () => {
    await loadProjectState(
      buildPluginRuntimeProjectState(
        "project-config-section-snapshots",
        [],
        ["section-a", "section-b"],
      ),
    );
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  globalThis.__settaCapturedPluginHost = host;\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["subscribeProjectState"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    const observedSnapshots: Record<string, unknown>[] = [];
    const unsubscribe = host.subscribeProjectState(
      {
        kind: "sections",
        sectionIds: ["section-a", "section-b"],
      },
      (nextValue) => {
        observedSnapshots.push(nextValue as Record<string, unknown>);
      },
      {
        fireImmediately: true,
      },
    );
    useProjectState.setState((state) => {
      state.sectionImpls["impl-section-b"] = createDictSectionImpl({
        id: "impl-section-b",
        name: "Section section-b updated",
      });
    });
    unsubscribe();
    expect(observedSnapshots).toHaveLength(2);
    expect(observedSnapshots[1]?.["section-a"]).toBe(
      observedSnapshots[0]?.["section-a"],
    );
    expect(observedSnapshots[1]?.["section-b"]).not.toBe(
      observedSnapshots[0]?.["section-b"],
    );
  });
  it("returns plugin section-kind lookup and sorted section-kind lists", () => {
    const alpha = {
      pluginId: "acme.plugin",
      kind: "widget-a",
      title: "Alpha Widget",
      renderer: {
        mount: () => undefined,
      },
    } as RegisteredPluginSectionKind;
    const zeta = {
      pluginId: "acme.plugin",
      kind: "widget-b",
      title: "Zeta Widget",
      renderer: {
        mount: () => undefined,
      },
    } as RegisteredPluginSectionKind;
    usePluginRuntimeStore.setState({
      sectionKindsByKey: {
        [toPluginSectionKindKey("acme.plugin", "widget-b")]: zeta,
        [toPluginSectionKindKey("acme.plugin", "widget-a")]: alpha,
      },
      sortedSectionKinds: [alpha, zeta],
    });
    const selected = readPluginRuntimeHookValue(() =>
      usePluginSectionKind("acme.plugin", "widget-a"),
    );
    expect(selected?.title).toBe("Alpha Widget");
    const missing = readPluginRuntimeHookValue(() =>
      usePluginSectionKind("acme.plugin", "missing"),
    );
    expect(missing).toBeNull();
    const sectionKinds = readPluginRuntimeHookValue(() =>
      usePluginSectionKinds(),
    );
    expect(sectionKinds.map((entry) => entry.title)).toEqual([
      "Alpha Widget",
      "Zeta Widget",
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
    const result = await loadPluginFrontendModule(plugin, "ide");
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
    const result = await loadPluginFrontendModule(plugin, "ide");
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
    const result = await loadPluginFrontendModule(plugin, "ide");
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
    const result = await loadPluginFrontendModule(plugin, "ide");
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
    const result = await loadPluginFrontendModule(plugin, "ide");
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
    const result = await loadPluginFrontendModule(plugin, "ide");
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
    const result = await loadPluginFrontendModule(plugin, "ide");
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
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    expect(result?.registryDelta?.topNavBarItems["acme.plugin"]?.[0]?.id).toBe(
      "quick-action",
    );
  });
});
