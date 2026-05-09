import { syncStoreInitialState } from "components/Panes/paneTestUtils";
import * as openAPI from "openapi/http";
import {
  resetAppSubsystemFrontendRuntimeState,
  useAppSubsystemFrontendStore,
} from "plugins/appSubsystem";
import {
  invokePluginSettingRevealHandler,
  refreshPluginRuntime,
  usePluginCanvasControls,
  usePluginCommands,
  usePluginListEntries,
  usePluginPaneTabs,
  usePluginRuntimeStore,
  usePluginStatusEntries,
  usePluginTopNavBarItems,
} from "plugins/runtime";
import {
  clearPluginRuntimeSideEffects,
  loadPluginFrontendModule,
  runWithConcurrencyLimit,
  shouldLoadPluginFrontend,
  shouldLoadPluginFrontendForFeatureSelection,
} from "plugins/runtimeInternal";
import {
  computePluginSectionFallbackReason,
  PluginFrontendErrorCodeEnum,
  toPluginSectionKindKey,
} from "plugins/runtimeShared";
import React from "react";
import { renderToString } from "react-dom/server";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState, useShareSession } from "state/definitions";
import {
  createVariant,
  PluginRuntimeStateEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type StateCreator, type StoreApi } from "zustand/vanilla";
import {
  buildPluginListEntry,
  buildPluginListResponse,
  buildPluginStatusEntry,
  buildPluginStatusResponse,
  buildRuntimeEndpointResponse,
  buildWatchCodeCapabilities,
  expectPluginFrontendErrorCode,
  loadPluginRevealHandlerFixture,
  RuntimeTestWebSocket,
  seedRuntimePluginSectionState,
  seedRuntimeSectionState,
} from "./runtimeHostProjectApis.helpers.test";

function resetPluginRuntimeStateForTests(): void {
  clearPluginRuntimeSideEffects();
  resetAppSubsystemFrontendRuntimeState();
  usePluginRuntimeStore.setState({
    status: "idle",
    statusMessage: null,
    schemaVersion: null,
    serverMode: null,
    appSubsystemCapabilities: null,
    watchCodeCapabilities: null,
    restartCapability: null,
    pluginListById: {},
    sortedPluginListEntries: [],
    pluginStatusById: {},
    statusEntries: [],
    languageServerSelectionsByLanguage: {},
    languageServerSelections: [],
    appSubsystemRegistrationsByPluginId: {},
    sectionKindsByKey: {},
    sortedSectionKinds: [],
    panesByPluginId: {},
    sortedPaneTabs: [],
    commandsByPluginId: {},
    sortedCommands: [],
    topNavBarItemsByPluginId: {},
    sortedTopNavBarItems: [],
    canvasControlsByPluginId: {},
    sortedCanvasControls: [],
    frontendErrorsByPluginId: {},
  });
}

type CapturedPluginHost = {
  createStore: <TState extends object>(
    initializer: StateCreator<TState, [], []>,
  ) => StoreApi<TState>;
  registerCanvasControl: (definition: Record<string, unknown>) => void;
  registerContextMenu: (definition: Record<string, unknown>) => void;
  getProjectContext: () => {
    projectConfigId: string;
    serverMode: string;
  };
  subscribeProjectContext: (
    listener: (context: {
      projectConfigId: string;
      serverMode: string;
    }) => void,
  ) => () => void;
  readProjectState: (selector: Record<string, unknown>) => unknown;
  subscribeProjectState: (
    selector: Record<string, unknown>,
    listener: (nextValue: unknown, prevValue: unknown | null) => void,
    options?: {
      fireImmediately?: boolean;
      throttleMs?: number;
    },
  ) => () => void;
  fetchBackendRoute: (path: string, init?: RequestInit) => Promise<Response>;
  emitRealtimeDependencyEvent: (event: Record<string, unknown>) => void;
  emitSectionRealtimeValue: (
    sectionId: string,
    value: unknown,
    options?: {
      timestampMs?: number;
    },
  ) => void;
  readSection: (sectionId: string) => Record<string, unknown>;
  updateSection: (
    sectionId: string,
    patch: Partial<{
      data: Record<string, unknown>;
      kind: string;
      schemaVersion: number | null;
    }>,
  ) => void;
  openArtifact: (artifactId: string) => void;
  createArtifact: (
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};
function readPluginRuntimeHookValue<T>(read: () => T): T {
  syncStoreInitialState(usePluginRuntimeStore);
  let captured: T | undefined;
  let hasCaptured = false;
  function Capture(): null {
    captured = read();
    hasCaptured = true;
    return null;
  }
  renderToString(React.createElement(Capture));
  if (!hasCaptured) {
    throw new Error("Expected plugin runtime hook to produce a value.");
  }
  return captured as T;
}

function readAppSubsystemHookValue<T>(read: () => T): T {
  syncStoreInitialState(useAppSubsystemFrontendStore);
  let captured: T | undefined;
  let hasCaptured = false;
  function Capture(): null {
    captured = read();
    hasCaptured = true;
    return null;
  }
  renderToString(React.createElement(Capture));
  if (!hasCaptured) {
    throw new Error("Expected app subsystem hook to produce a value.");
  }
  return captured as T;
}

function getCapturedPluginHost(): CapturedPluginHost {
  const globalScope = globalThis as {
    __settaCapturedPluginHost?: CapturedPluginHost;
  };
  if (!globalScope.__settaCapturedPluginHost) {
    throw new Error("Plugin test module did not capture host object.");
  }
  return globalScope.__settaCapturedPluginHost;
}

describe("plugin runtime host project APIs and registry views", () => {
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
  it("rejects updateSection calls for non-plugin sections", async () => {
    const sectionId = "section-runtime-dict-update";
    seedRuntimeSectionState(sectionId);
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
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    expectPluginFrontendErrorCode(
      () =>
        host.updateSection(sectionId, {
          kind: "updated",
        }),
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });
  it("rejects readSection calls for non-plugin sections", async () => {
    const sectionId = "section-runtime-dict-read";
    seedRuntimeSectionState(sectionId);
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
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    expectPluginFrontendErrorCode(
      () => host.readSection(sectionId),
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });
  it("rejects updateSection calls when section variant cannot be resolved", async () => {
    const sectionId = "section-runtime-missing-variant";
    const variantId = "variant-runtime-missing";
    useProjectState.setState((state) => {
      state.projectConfig.sectionVariantMap[sectionId] = variantId;
      delete state.sectionVariants[variantId];
    });
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
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    expectPluginFrontendErrorCode(
      () =>
        host.updateSection(sectionId, {
          kind: "updated",
        }),
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });
  it("rejects updateSection calls when section implementation cannot be resolved", async () => {
    const sectionId = "section-runtime-missing-impl";
    const variantId = "variant-runtime-missing-impl";
    const missingImplId = "impl-runtime-missing";
    useProjectState.setState((state) => {
      state.projectConfig.sectionVariantMap[sectionId] = variantId;
      state.sectionVariants[variantId] = createVariant({
        id: variantId,
        impl: missingImplId,
        nonPresetImpls: [missingImplId],
      });
      delete state.sectionImpls[missingImplId];
    });
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
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    expectPluginFrontendErrorCode(
      () =>
        host.updateSection(sectionId, {
          kind: "updated",
        }),
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });
  it("supports updateSection for plugin sections and clones patch payloads", async () => {
    const sectionId = "section-runtime-plugin-update";
    seedRuntimePluginSectionState(sectionId);
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
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    const patchData = {
      text: "updated",
      nested: {
        enabled: true,
      },
    };
    host.updateSection(sectionId, {
      data: patchData,
      kind: "updated-kind",
      schemaVersion: 2,
    });
    patchData.nested.enabled = false;
    const updated = host.readSection(sectionId);
    expect(updated.type).toBe(SectionTypeEnum.Plugin);
    expect(updated.kind).toBe("updated-kind");
    expect(updated.schemaVersion).toBe(2);
    expect(updated.data).toEqual({
      text: "updated",
      nested: {
        enabled: true,
      },
    });
  });
  it("returns sorted plugin pane tabs by title then plugin id then pane id", () => {
    const sortedTabs = [
      {
        tabKey: "tab-alpha-acme",
        pluginId: "acme.plugin",
        paneId: "pane-a",
        title: "Alpha",
      },
      {
        tabKey: "tab-alpha-beta",
        pluginId: "beta.plugin",
        paneId: "pane-z",
        title: "Alpha",
      },
      {
        tabKey: "tab-beta-acme",
        pluginId: "acme.plugin",
        paneId: "pane-c",
        title: "Beta",
      },
    ];
    usePluginRuntimeStore.setState({
      panesByPluginId: {
        "beta.plugin": [
          {
            pluginId: "beta.plugin",
            id: "pane-z",
            title: "Alpha",
            renderer: { mount: () => undefined },
          },
        ],
        "acme.plugin": [
          {
            pluginId: "acme.plugin",
            id: "pane-c",
            title: "Beta",
            renderer: { mount: () => undefined },
          },
          {
            pluginId: "acme.plugin",
            id: "pane-a",
            title: "Alpha",
            renderer: { mount: () => undefined },
          },
        ],
      },
      sortedPaneTabs: sortedTabs,
    });
    const tabs = readPluginRuntimeHookValue(() => usePluginPaneTabs());
    expect(
      tabs.map((tab) => `${tab.title}:${tab.pluginId}:${tab.paneId}`),
    ).toEqual([
      "Alpha:acme.plugin:pane-a",
      "Alpha:beta.plugin:pane-z",
      "Beta:acme.plugin:pane-c",
    ]);
  });
  it("returns sorted plugin commands by title then plugin id then command id", () => {
    const sortedCommands = [
      {
        pluginId: "acme.plugin",
        id: "cmd-a",
        title: "Action",
        run: () => undefined,
      },
      {
        pluginId: "beta.plugin",
        id: "cmd-z",
        title: "Action",
        run: () => undefined,
      },
      {
        pluginId: "acme.plugin",
        id: "cmd-b",
        title: "Build",
        run: () => undefined,
      },
    ];
    usePluginRuntimeStore.setState({
      commandsByPluginId: {
        "beta.plugin": [
          {
            pluginId: "beta.plugin",
            id: "cmd-z",
            title: "Action",
            run: () => undefined,
          },
        ],
        "acme.plugin": [
          {
            pluginId: "acme.plugin",
            id: "cmd-a",
            title: "Action",
            run: () => undefined,
          },
          {
            pluginId: "acme.plugin",
            id: "cmd-b",
            title: "Build",
            run: () => undefined,
          },
        ],
      },
      sortedCommands,
    });
    const commands = readPluginRuntimeHookValue(() => usePluginCommands());
    expect(
      commands.map(
        (command) => `${command.title}:${command.pluginId}:${command.id}`,
      ),
    ).toEqual([
      "Action:acme.plugin:cmd-a",
      "Action:beta.plugin:cmd-z",
      "Build:acme.plugin:cmd-b",
    ]);
  });
  it("returns sorted top-nav items by order then label then plugin id and id", () => {
    const sortedTopNavItems = [
      {
        pluginId: "acme.plugin",
        id: "item-a",
        label: "Deploy",
        order: 1,
        onClick: () => undefined,
      },
      {
        pluginId: "beta.plugin",
        id: "item-z",
        label: "Deploy",
        order: 1,
        onClick: () => undefined,
      },
      {
        pluginId: "acme.plugin",
        id: "item-build",
        label: "Build",
        order: 2,
        onClick: () => undefined,
      },
    ];
    usePluginRuntimeStore.setState({
      topNavBarItemsByPluginId: {
        "beta.plugin": [
          {
            pluginId: "beta.plugin",
            id: "item-z",
            label: "Deploy",
            order: 1,
            onClick: () => undefined,
          },
        ],
        "acme.plugin": [
          {
            pluginId: "acme.plugin",
            id: "item-a",
            label: "Deploy",
            order: 1,
            onClick: () => undefined,
          },
          {
            pluginId: "acme.plugin",
            id: "item-build",
            label: "Build",
            order: 2,
            onClick: () => undefined,
          },
        ],
      },
      sortedTopNavBarItems: sortedTopNavItems,
    });
    const items = readPluginRuntimeHookValue(() => usePluginTopNavBarItems());
    expect(
      items.map(
        (item) => `${item.order}:${item.label}:${item.pluginId}:${item.id}`,
      ),
    ).toEqual([
      "1:Deploy:acme.plugin:item-a",
      "1:Deploy:beta.plugin:item-z",
      "2:Build:acme.plugin:item-build",
    ]);
  });
  it("returns sorted canvas controls by placement then order, label, plugin id, and id", () => {
    const sortedCanvasControls = [
      {
        pluginId: "acme.plugin",
        id: "control-a",
        label: "Watch Code",
        placement: "project" as const,
        order: 1,
        renderer: { mount: () => undefined },
      },
      {
        pluginId: "beta.plugin",
        id: "control-z",
        label: "Watch Code",
        placement: "project" as const,
        order: 1,
        renderer: { mount: () => undefined },
      },
      {
        pluginId: "acme.plugin",
        id: "control-utility",
        label: "Utility",
        placement: "utility" as const,
        order: 0,
        renderer: { mount: () => undefined },
      },
    ];
    usePluginRuntimeStore.setState({
      canvasControlsByPluginId: {
        "beta.plugin": [sortedCanvasControls[1]],
        "acme.plugin": [sortedCanvasControls[0], sortedCanvasControls[2]],
      },
      sortedCanvasControls,
    });
    const controls = readPluginRuntimeHookValue(() =>
      usePluginCanvasControls(),
    );
    expect(
      controls.map(
        (control) =>
          `${control.placement}:${control.order}:${control.label}:${control.pluginId}:${control.id}`,
      ),
    ).toEqual([
      "project:1:Watch Code:acme.plugin:control-a",
      "project:1:Watch Code:beta.plugin:control-z",
      "utility:0:Utility:acme.plugin:control-utility",
    ]);
  });
  it("returns plugin list entries sorted by plugin id", () => {
    const alpha = buildPluginListEntry({
      pluginId: "alpha.plugin",
    });
    const zeta = buildPluginListEntry({
      pluginId: "zeta.plugin",
    });
    usePluginRuntimeStore.setState({
      pluginListById: {
        "zeta.plugin": zeta,
        "alpha.plugin": alpha,
      },
      sortedPluginListEntries: [alpha, zeta],
    });
    const entries = readPluginRuntimeHookValue(() => usePluginListEntries());
    expect(entries.map((entry) => entry.pluginId)).toEqual([
      "alpha.plugin",
      "zeta.plugin",
    ]);
  });
  it("returns status entries from the runtime store", () => {
    const first = buildPluginStatusEntry({
      pluginId: "alpha.plugin",
      sourcePath: "/tmp/alpha",
    });
    const second = buildPluginStatusEntry({
      pluginId: "beta.plugin",
      sourcePath: "/tmp/beta",
    });
    usePluginRuntimeStore.setState({
      statusEntries: [first, second],
    });
    const entries = readPluginRuntimeHookValue(() => usePluginStatusEntries());
    expect(entries.map((entry) => entry.pluginId)).toEqual([
      "alpha.plugin",
      "beta.plugin",
    ]);
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
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () =>
      buildRuntimeEndpointResponse(listPayload, statusPayload),
    );
    await refreshPluginRuntime();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(1);
    listPayload = buildPluginListResponse([]);
    statusPayload = buildPluginStatusResponse([]);
    await refreshPluginRuntime();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(0);
  });
  it("skips frontend module imports when plugin status is disabled", async () => {
    const globalScope = globalThis as {
      __settaDisabledModuleLoads?: number;
      __settaDisabledRegisterCalls?: number;
    };
    delete globalScope.__settaDisabledModuleLoads;
    delete globalScope.__settaDisabledRegisterCalls;
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "const scope = globalThis;\n" +
          "scope.__settaDisabledModuleLoads = Number(scope.__settaDisabledModuleLoads || 0) + 1;\n" +
          "export const apiVersion = 1;\n" +
          "export function register(_host) {\n" +
          "  scope.__settaDisabledRegisterCalls = Number(scope.__settaDisabledRegisterCalls || 0) + 1;\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      pluginId: "disabled.plugin",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
    });
    const status = buildPluginStatusEntry({
      pluginId: "disabled.plugin",
      state: PluginRuntimeStateEnum.disabled,
    });
    vi.spyOn(openAPI, "getPluginsRuntime").mockResolvedValue(
      buildRuntimeEndpointResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([status]),
      ),
    );
    await refreshPluginRuntime();
    expect(globalScope.__settaDisabledModuleLoads).toBeUndefined();
    expect(globalScope.__settaDisabledRegisterCalls).toBeUndefined();
  });
  it("applies plugin frontend load work with a bounded concurrency limit", async () => {
    const tasks = Array.from({ length: 12 }, (_value, index) => index);
    const completed: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    await runWithConcurrencyLimit(tasks, 3, async (taskIndex: number) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
      completed.push(taskIndex);
      inFlight -= 1;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(completed).toHaveLength(tasks.length);
    expect(completed.sort((a, b) => a - b)).toEqual(tasks);
  });
  it("only loads plugin frontends when runtime status is active or pending restart", () => {
    expect(shouldLoadPluginFrontend(undefined)).toBe(false);
    expect(
      shouldLoadPluginFrontend(
        buildPluginStatusEntry({ state: PluginRuntimeStateEnum.active }),
      ),
    ).toBe(true);
    expect(
      shouldLoadPluginFrontend(
        buildPluginStatusEntry({
          state: PluginRuntimeStateEnum.pending_restart,
        }),
      ),
    ).toBe(true);
    expect(
      shouldLoadPluginFrontend(
        buildPluginStatusEntry({ state: PluginRuntimeStateEnum.disabled }),
      ),
    ).toBe(false);
    expect(
      shouldLoadPluginFrontend(
        buildPluginStatusEntry({ state: PluginRuntimeStateEnum.invalid }),
      ),
    ).toBe(false);
  });
  it("does not load unavailable Watch Code provider frontends", () => {
    expect(
      shouldLoadPluginFrontendForFeatureSelection({
        pluginId: "setta-watch-code",
        statusEntry: buildPluginStatusEntry({
          pluginId: "setta-watch-code",
          state: PluginRuntimeStateEnum.pending_restart,
        }),
        watchCodeCapabilities: buildWatchCodeCapabilities({
          providerSelection: {
            status: "pending_restart",
            selectedPluginId: null,
            activePluginIds: [],
            pendingRestartPluginIds: ["setta-watch-code"],
            disabledPluginIds: [],
            invalidPluginIds: [],
            conflictingPluginIds: [],
          },
        }),
      }),
    ).toBe(false);
    expect(
      shouldLoadPluginFrontendForFeatureSelection({
        pluginId: "setta-watch-code",
        statusEntry: buildPluginStatusEntry({
          pluginId: "setta-watch-code",
          state: PluginRuntimeStateEnum.active,
          blockedCapabilities: [
            {
              capability: "registerWatchCodeBackend",
              reason: "mode_policy",
            },
          ],
        }),
        watchCodeCapabilities: buildWatchCodeCapabilities({
          providerSelection: {
            status: "invalid_provider",
            selectedPluginId: null,
            activePluginIds: [],
            pendingRestartPluginIds: [],
            disabledPluginIds: [],
            invalidPluginIds: ["setta-watch-code"],
            conflictingPluginIds: [],
          },
        }),
      }),
    ).toBe(false);
    expect(
      shouldLoadPluginFrontendForFeatureSelection({
        pluginId: "setta-watch-code",
        statusEntry: buildPluginStatusEntry({
          pluginId: "setta-watch-code",
          state: PluginRuntimeStateEnum.active,
        }),
        watchCodeCapabilities: buildWatchCodeCapabilities({
          providerSelection: {
            status: "active",
            selectedPluginId: "setta-watch-code",
            activePluginIds: ["setta-watch-code"],
            pendingRestartPluginIds: [],
            disabledPluginIds: [],
            invalidPluginIds: [],
            conflictingPluginIds: [],
          },
        }),
      }),
    ).toBe(true);
  });
  it("returns section_kind_missing fallback when plugin is active but kind is not registered", () => {
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
    expect(
      computePluginSectionFallbackReason(
        usePluginRuntimeStore.getState(),
        "acme.plugin",
        "kind",
      ),
    ).toBe("section_kind_missing");
  });
  it("returns null when section kind is already registered", () => {
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
      sectionKindsByKey: {
        [toPluginSectionKindKey("acme.plugin", "kind")]: {
          pluginId: "acme.plugin",
          kind: "kind",
          title: "Acme Kind",
          renderer: {
            mount: () => undefined,
          },
        },
      },
    });
    expect(
      computePluginSectionFallbackReason(
        usePluginRuntimeStore.getState(),
        "acme.plugin",
        "kind",
      ),
    ).toBeNull();
  });
  it("treats non-boolean plugin reveal handler results as contract failures", async () => {
    const pluginId = "acme.plugin";
    const revealKey = "full-settings";
    await loadPluginRevealHandlerFixture(
      "host.registerSettingRevealHandler('full-settings', () => {\n" +
        "  const malformed = JSON.parse('\"unexpected-string\"');\n" +
        "  return malformed;\n" +
        "});",
    );
    const result = await invokePluginSettingRevealHandler({
      pluginId,
      revealKey,
      settingId: "plugin::acme.plugin::enabled",
      paneId: "full-settings-pane",
      durationMs: 1200,
      abortSignal: new AbortController().signal,
    });
    expect(result).toEqual({
      ok: false,
      message:
        "Plugin acme.plugin reveal handler full-settings returned a non-boolean value.",
    });
  });
  it("fails before invoking the plugin reveal handler when abort is pre-signaled", async () => {
    const pluginId = "acme.plugin";
    const revealKey = "full-settings";
    const handlerSpy = vi.fn(() => true);
    (
      globalThis as {
        __settaRevealHandlerSpy?: (...args: unknown[]) => unknown;
      }
    ).__settaRevealHandlerSpy = handlerSpy;
    await loadPluginRevealHandlerFixture(
      "host.registerSettingRevealHandler('full-settings', (context) => " +
        "globalThis.__settaRevealHandlerSpy?.(context));",
    );
    const controller = new AbortController();
    controller.abort();
    const result = await invokePluginSettingRevealHandler({
      pluginId,
      revealKey,
      settingId: "plugin::acme.plugin::enabled",
      paneId: "full-settings-pane",
      durationMs: 1200,
      abortSignal: controller.signal,
    });
    expect(handlerSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      message:
        "Plugin acme.plugin reveal handler full-settings was aborted before invocation.",
    });
  });
  it("returns a timeout message when plugin reveal handler settles after abort", async () => {
    const pluginId = "acme.plugin";
    const revealKey = "full-settings";
    await loadPluginRevealHandlerFixture(
      "host.registerSettingRevealHandler('full-settings', ({ abortSignal }) =>\n" +
        "  new Promise((resolve) => {\n" +
        "    abortSignal.addEventListener(\n" +
        "      'abort',\n" +
        "      () => {\n" +
        "        resolve(true);\n" +
        "      },\n" +
        "      { once: true },\n" +
        "    );\n" +
        "  }));",
    );
    const controller = new AbortController();
    const pendingResult = invokePluginSettingRevealHandler({
      pluginId,
      revealKey,
      settingId: "plugin::acme.plugin::enabled",
      paneId: "full-settings-pane",
      durationMs: 1200,
      abortSignal: controller.signal,
    });
    controller.abort();
    const result = await pendingResult;
    expect(result).toEqual({
      ok: false,
      message: "Plugin acme.plugin reveal handler full-settings timed out.",
    });
  });
});
