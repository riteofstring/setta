import { syncStoreInitialState } from "components/Panes/paneTestUtils";
import * as openAPI from "openapi/http";
import {
  resetAppSubsystemFrontendRuntimeState,
  useAppSubsystemFrontendStore,
} from "plugins/appSubsystem";
import { refreshPluginRuntime, usePluginRuntimeStore } from "plugins/runtime";
import {
  clearPluginRuntimeSideEffects,
  loadPluginFrontendModule,
} from "plugins/runtimeInternal";
import { PluginFrontendErrorCodeEnum } from "plugins/runtimeShared";
import React from "react";
import { renderToString } from "react-dom/server";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState, useShareSession } from "state/definitions";
import { PluginRuntimeStateEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type StateCreator, type StoreApi } from "zustand/vanilla";
import {
  RuntimeTestWebSocket,
  buildPluginListEntry,
  buildPluginListResponse,
  buildPluginStatusEntry,
  buildPluginStatusResponse,
  buildRuntimeEndpointResponse,
  buildRuntimeRequestFailure,
  expectPluginFrontendErrorCode,
  withStatusPayloadDigest,
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

async function loadPluginRevealHandlerFixture(
  registerSource: string,
): Promise<void> {
  const moduleUrl =
    "data:text/javascript," +
    encodeURIComponent(
      "export const apiVersion = 1;\n" +
        "export function register(host) {\n" +
        `${registerSource}\n` +
        "}\n",
    );
  const result = await loadPluginFrontendModule(
    buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerSettingRevealHandler"],
    }),
    "ide",
  );
  expect(result?.error).toBeNull();
}

describe("plugin runtime host subscriptions", () => {
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
  it("removes plugin styles when refresh enters error state", async () => {
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
    const loadResult = await loadPluginFrontendModule(pluginWithStyle, "ide");
    expect(loadResult?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(1);
    vi.spyOn(openAPI, "getPluginsRuntime").mockResolvedValue(
      buildRuntimeRequestFailure(500),
    );
    await refreshPluginRuntime();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(0);
  });
  it("uses the first backend-ordered status entry as the primary plugin status", async () => {
    const plugin = buildPluginListEntry({});
    vi.spyOn(openAPI, "getPluginsRuntime").mockResolvedValue(
      buildRuntimeEndpointResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: "acme.plugin",
            sourcePath: "/tmp/primary",
            shadowedBySourcePath: null,
          }),
          buildPluginStatusEntry({
            pluginId: "acme.plugin",
            sourcePath: "/tmp/shadowed",
            shadowedBySourcePath: "/tmp/primary",
          }),
        ]),
      ),
    );
    await refreshPluginRuntime();
    const state = usePluginRuntimeStore.getState();
    expect(state.pluginStatusById["acme.plugin"]?.sourcePath).toBe(
      "/tmp/primary",
    );
  });
  it("prefers active non-shadowed status entries over invalid duplicates", async () => {
    const plugin = buildPluginListEntry({});
    vi.spyOn(openAPI, "getPluginsRuntime").mockResolvedValue(
      buildRuntimeEndpointResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: "acme.plugin",
            state: PluginRuntimeStateEnum.active,
            sourcePath: "/tmp/setta-files-active",
            shadowedBySourcePath: null,
          }),
          buildPluginStatusEntry({
            pluginId: "acme.plugin",
            state: PluginRuntimeStateEnum.invalid,
            sourcePath: "/tmp/workspace-invalid",
            shadowedBySourcePath: null,
          }),
        ]),
      ),
    );
    await refreshPluginRuntime();
    const state = usePluginRuntimeStore.getState();
    expect(state.pluginStatusById["acme.plugin"]?.sourcePath).toBe(
      "/tmp/setta-files-active",
    );
  });
  it("prefers active non-shadowed status entries over disabled duplicates", async () => {
    const plugin = buildPluginListEntry({});
    vi.spyOn(openAPI, "getPluginsRuntime").mockResolvedValue(
      buildRuntimeEndpointResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: "acme.plugin",
            state: PluginRuntimeStateEnum.active,
            sourcePath: "/tmp/setta-files-active",
            shadowedBySourcePath: null,
          }),
          buildPluginStatusEntry({
            pluginId: "acme.plugin",
            state: PluginRuntimeStateEnum.disabled,
            sourcePath: "/tmp/workspace-disabled",
            shadowedBySourcePath: null,
          }),
        ]),
      ),
    );
    await refreshPluginRuntime();
    const state = usePluginRuntimeStore.getState();
    expect(state.pluginStatusById["acme.plugin"]?.sourcePath).toBe(
      "/tmp/setta-files-active",
    );
  });
  it("reuses unchanged plugin frontend registrations across refreshes", async () => {
    const globalScope = globalThis as {
      __settaIncrementalRegisterCalls?: number;
    };
    delete globalScope.__settaIncrementalRegisterCalls;
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(_host) {\n" +
          "  globalThis.__settaIncrementalRegisterCalls = Number(globalThis.__settaIncrementalRegisterCalls || 0) + 1;\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      sourceDigestSha256: "digest-1",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
    });
    const status = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
    });
    let listPayload = buildPluginListResponse([plugin]);
    let statusPayload = buildPluginStatusResponse([status]);
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () =>
      buildRuntimeEndpointResponse(listPayload, statusPayload),
    );
    await refreshPluginRuntime();
    await refreshPluginRuntime();
    expect(globalScope.__settaIncrementalRegisterCalls).toBe(1);
    expect(usePluginRuntimeStore.getState().status).toBe("loaded");
  });
  it("does not reload plugin frontend when effective capability order changes", async () => {
    const globalScope = globalThis as {
      __settaCapabilityOrderRegisterCalls?: number;
    };
    delete globalScope.__settaCapabilityOrderRegisterCalls;
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(_host) {\n" +
          "  globalThis.__settaCapabilityOrderRegisterCalls = Number(globalThis.__settaCapabilityOrderRegisterCalls || 0) + 1;\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      pluginId: "acme.capability-order",
      sourceDigestSha256: "digest-capability-order",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerPane", "registerCommand"],
    });
    let effectiveCapabilities = ["registerPane", "registerCommand"];
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () =>
      buildRuntimeEndpointResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: plugin.pluginId,
            requestedCapabilities: [...effectiveCapabilities],
            effectiveCapabilities: [...effectiveCapabilities],
            blockedCapabilities: [],
          }),
        ]),
      ),
    );
    await refreshPluginRuntime();
    effectiveCapabilities = ["registerCommand", "registerPane"];
    await refreshPluginRuntime();
    expect(globalScope.__settaCapabilityOrderRegisterCalls).toBe(1);
  });
  it("recovers plugin registrations after transient runtime errors with unchanged signatures", async () => {
    const globalScope = globalThis as {
      __settaRecoveryRegisterCalls?: number;
    };
    delete globalScope.__settaRecoveryRegisterCalls;
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  globalThis.__settaRecoveryRegisterCalls = Number(globalThis.__settaRecoveryRegisterCalls || 0) + 1;\n" +
          "  host.registerPane({ id: 'recovery-pane', title: 'Recovery Pane', renderer: { mount() {} } });\n" +
          "}\n",
      );
    const runtimeCapabilities = ["registerPane"];
    const plugin = buildPluginListEntry({
      pluginId: "acme.runtime-recovery",
      sourceDigestSha256: "digest-recovery",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: runtimeCapabilities,
    });
    const status = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
      requestedCapabilities: runtimeCapabilities,
      effectiveCapabilities: runtimeCapabilities,
      blockedCapabilities: [],
    });
    let runtimeCalls = 0;
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () => {
      runtimeCalls += 1;
      if (runtimeCalls === 2) {
        return buildRuntimeRequestFailure(500);
      }
      return buildRuntimeEndpointResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([status]),
      );
    });
    await refreshPluginRuntime();
    expect(globalScope.__settaRecoveryRegisterCalls).toBe(1);
    expect(
      usePluginRuntimeStore.getState().panesByPluginId[plugin.pluginId]?.[0]
        ?.id,
    ).toBe("recovery-pane");
    await refreshPluginRuntime();
    expect(usePluginRuntimeStore.getState().status).toBe("error");
    await refreshPluginRuntime();
    const recoveredState = usePluginRuntimeStore.getState();
    expect(recoveredState.status).toBe("loaded");
    expect(globalScope.__settaRecoveryRegisterCalls).toBe(2);
    expect(recoveredState.panesByPluginId[plugin.pluginId]?.[0]?.id).toBe(
      "recovery-pane",
    );
  });
  it("reuses sorted registry views across no-op runtime refreshes", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  host.registerSectionKind({ kind: 'fixture-kind', title: 'Fixture Kind', renderer: { mount() {} } });\n" +
          "  host.registerPane({ id: 'fixture-pane', title: 'Fixture Pane', renderer: { mount() {} } });\n" +
          "  host.registerCommand({ id: 'fixture-command', title: 'Fixture Command', run() {} });\n" +
          "  host.registerTopNavBarItem({ id: 'fixture-nav', label: 'Fixture Nav', onClick() {} });\n" +
          "  host.registerCanvasControl({ id: 'fixture-control', label: 'Fixture Control', renderer: { mount() {} } });\n" +
          "}\n",
      );
    const runtimeCapabilities = [
      "registerSectionKinds",
      "registerPane",
      "registerCommand",
      "registerTopNavBarItem",
      "registerCanvasControl",
    ];
    const plugin = buildPluginListEntry({
      pluginId: "acme.runtime-perf",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: runtimeCapabilities,
    });
    const status = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
      requestedCapabilities: runtimeCapabilities,
      effectiveCapabilities: runtimeCapabilities,
      blockedCapabilities: [],
    });
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () =>
      buildRuntimeEndpointResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([status]),
      ),
    );
    await refreshPluginRuntime();
    const firstState = usePluginRuntimeStore.getState();
    const firstSortedPluginListEntries = firstState.sortedPluginListEntries;
    const firstSortedSectionKinds = firstState.sortedSectionKinds;
    const firstSortedPaneTabs = firstState.sortedPaneTabs;
    const firstSortedCommands = firstState.sortedCommands;
    const firstSortedTopNavBarItems = firstState.sortedTopNavBarItems;
    const firstSortedCanvasControls = firstState.sortedCanvasControls;
    await refreshPluginRuntime();
    const secondState = usePluginRuntimeStore.getState();
    expect(secondState.sortedPluginListEntries).toBe(
      firstSortedPluginListEntries,
    );
    expect(secondState.sortedSectionKinds).toBe(firstSortedSectionKinds);
    expect(secondState.sortedPaneTabs).toBe(firstSortedPaneTabs);
    expect(secondState.sortedCommands).toBe(firstSortedCommands);
    expect(secondState.sortedTopNavBarItems).toBe(firstSortedTopNavBarItems);
    expect(secondState.sortedCanvasControls).toBe(firstSortedCanvasControls);
  });
  it("reuses plugin status entry references across no-op runtime refreshes", async () => {
    const plugin = buildPluginListEntry({
      pluginId: "acme.status-reuse",
      frontend: {
        entrypointUrl: null,
        styleUrl: null,
      },
    });
    const status = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
      requestedCapabilities: ["registerPane"],
      effectiveCapabilities: ["registerPane"],
    });
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () =>
      buildRuntimeEndpointResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([
          {
            ...status,
            requestedCapabilities: [...status.requestedCapabilities],
            effectiveCapabilities: [...status.effectiveCapabilities],
            blockedCapabilities: [...status.blockedCapabilities],
            registeredCodegenTargets: [...status.registeredCodegenTargets],
            errors: [...status.errors],
          },
        ]),
      ),
    );
    await refreshPluginRuntime();
    const firstState = usePluginRuntimeStore.getState();
    const firstPrimaryStatus = firstState.pluginStatusById[plugin.pluginId];
    const firstStatusEntries = firstState.statusEntries;
    const firstStatusEntry = firstStatusEntries[0];
    await refreshPluginRuntime();
    const secondState = usePluginRuntimeStore.getState();
    expect(secondState.statusEntries).toBe(firstStatusEntries);
    expect(secondState.statusEntries[0]).toBe(firstStatusEntry);
    expect(secondState.pluginStatusById[plugin.pluginId]).toBe(
      firstPrimaryStatus,
    );
  });
  it("replaces plugin status entry references when runtime payload digest changes", async () => {
    const plugin = buildPluginListEntry({
      pluginId: "acme.status-digest-change",
      frontend: {
        entrypointUrl: null,
        styleUrl: null,
      },
    });
    const baseStatus = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
      requestedCapabilities: ["registerPane"],
      effectiveCapabilities: ["registerPane"],
      blockedCapabilities: [],
    });
    const firstStatus = withStatusPayloadDigest(baseStatus, "digest-a");
    const secondStatus = withStatusPayloadDigest(
      {
        ...baseStatus,
        requestedCapabilities: [...baseStatus.requestedCapabilities],
        effectiveCapabilities: [...baseStatus.effectiveCapabilities],
      },
      "digest-b",
    );
    let runtimeCallCount = 0;
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () => {
      runtimeCallCount += 1;
      if (runtimeCallCount === 1) {
        return buildRuntimeEndpointResponse(
          buildPluginListResponse([plugin]),
          buildPluginStatusResponse([firstStatus]),
        );
      }
      return buildRuntimeEndpointResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([secondStatus]),
      );
    });
    await refreshPluginRuntime();
    const firstState = usePluginRuntimeStore.getState();
    const firstStatusEntry = firstState.statusEntries[0];
    await refreshPluginRuntime();
    const secondState = usePluginRuntimeStore.getState();
    const secondStatusEntry = secondState.statusEntries[0];
    expect(secondStatusEntry).not.toBe(firstStatusEntry);
  });
  it("reuses empty status entries across no-op runtime refreshes", async () => {
    vi.spyOn(openAPI, "getPluginsRuntime").mockResolvedValue(
      buildRuntimeEndpointResponse(
        buildPluginListResponse([]),
        buildPluginStatusResponse([]),
      ),
    );
    await refreshPluginRuntime();
    const firstState = usePluginRuntimeStore.getState();
    const firstStatusEntries = firstState.statusEntries;
    await refreshPluginRuntime();
    const secondState = usePluginRuntimeStore.getState();
    expect(secondState.statusEntries).toBe(firstStatusEntries);
  });
  it("reloads plugin frontend when refresh signature changes", async () => {
    const globalScope = globalThis as {
      __settaIncrementalRegisterCalls?: number;
    };
    delete globalScope.__settaIncrementalRegisterCalls;
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(_host) {\n" +
          "  globalThis.__settaIncrementalRegisterCalls = Number(globalThis.__settaIncrementalRegisterCalls || 0) + 1;\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      sourceDigestSha256: "digest-a",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
    });
    const status = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
    });
    let digest = "digest-a";
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () =>
      buildRuntimeEndpointResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            ...plugin,
            sourceDigestSha256: digest,
          }),
        ]),
        buildPluginStatusResponse([status]),
      ),
    );
    await refreshPluginRuntime();
    digest = "digest-b";
    await refreshPluginRuntime();
    expect(globalScope.__settaIncrementalRegisterCalls).toBe(2);
  });
  it("queues one follow-up refresh when calls overlap", async () => {
    let releaseRequests: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseRequests = resolve;
    });
    let runtimeCalls = 0;
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () => {
      runtimeCalls += 1;
      await gate;
      return buildRuntimeEndpointResponse(
        buildPluginListResponse([]),
        buildPluginStatusResponse([]),
      );
    });
    const first = refreshPluginRuntime();
    const second = refreshPluginRuntime();
    const third = refreshPluginRuntime();
    await Promise.resolve();
    expect(runtimeCalls).toBe(1);
    if (releaseRequests) {
      releaseRequests();
    }
    await Promise.all([first, second, third]);
    expect(runtimeCalls).toBe(2);
    expect(usePluginRuntimeStore.getState().status).toBe("loaded");
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
    const firstLoad = await loadPluginFrontendModule(pluginWithStyle, "ide");
    expect(firstLoad?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(1);
    const secondLoad = await loadPluginFrontendModule(pluginWithStyle, "ide");
    expect(secondLoad?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(1);
    const pluginWithoutStyle = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
    });
    const noStyleLoad = await loadPluginFrontendModule(
      pluginWithoutStyle,
      "ide",
    );
    expect(noStyleLoad?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(0);
  });
  it("removes plugin styles when frontend load fails", async () => {
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
        "export const apiVersion = 1;\nexport function register(_host) { throw new Error('boom'); }\n",
      );
    const pluginWithStyle = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: "/plugins/acme.plugin/frontend/dist/index.css?v=1",
      },
      effectiveCapabilities: ["registerPane"],
    });
    const result = await loadPluginFrontendModule(pluginWithStyle, "ide");
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.FrontendLoadFailed,
    );
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(0);
  });
  it("captures host APIs and enforces unimplemented host capabilities", async () => {
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
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    expectPluginFrontendErrorCode(
      () => host.registerContextMenu({ id: "ctx-menu" }),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
    expectPluginFrontendErrorCode(
      () => host.openArtifact("artifact-1"),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
    await expect(host.fetchBackendRoute("/fixture")).rejects.toMatchObject({
      code: PluginFrontendErrorCodeEnum.CapabilityDenied,
    });
    await expect(
      host.createArtifact({ kind: "artifact" }),
    ).rejects.toMatchObject({
      code: PluginFrontendErrorCodeEnum.CapabilityDenied,
    });
  });
});
