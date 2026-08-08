import { syncStoreInitialState } from "components/Panes/paneTestUtils";
import * as generatedEndpoints from "openapi/http";
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
import { setActiveSectionIds } from "state/actions/activeSections";
import * as realtimeDependencySend from "state/actions/realtimeDependencySend";
import { processProjectStateUpdateFromBackend } from "state/actions/sectionInfos";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState, useShareSession } from "state/definitions";
import {
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  type PluginListEntry,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type StateCreator, type StoreApi } from "zustand/vanilla";
import {
  RuntimeTestWebSocket,
  buildPluginListEntry,
  buildPluginListResponse,
  buildPluginRuntimeProjectStateUpdate,
  buildPluginStatusEntry,
  buildPluginStatusResponse,
  buildRuntimeEndpointResponse,
  expectPluginFrontendErrorCode,
  seedRuntimePluginSectionState,
  withPluginConfigDigests,
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
  it("restores activeSectionIds subscribers to backend truth after a failed durable selection publish", async () => {
    const sectionId = "section-runtime-plugin-failed-selection";
    seedRuntimePluginSectionState(sectionId);
    useActiveSectionUI.setState({ activeIds: [] });
    vi.spyOn(generatedEndpoints, "setActiveIds").mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: undefined,
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
      effectiveCapabilities: ["subscribeProjectState"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    const updates: Array<{
      nextValue: unknown;
      prevValue: unknown | null;
    }> = [];
    const unsubscribe = host.subscribeProjectState(
      { kind: "activeSectionIds" },
      (nextValue, prevValue) => {
        updates.push({
          nextValue,
          prevValue,
        });
      },
      {
        fireImmediately: false,
      },
    );
    setActiveSectionIds([sectionId], { syncMode: "immediate" });
    await Promise.resolve();
    await Promise.resolve();
    processProjectStateUpdateFromBackend(
      buildPluginRuntimeProjectStateUpdate([]),
    );
    unsubscribe();
    expect(updates).toEqual([
      {
        nextValue: [sectionId],
        prevValue: [],
      },
      {
        nextValue: [],
        prevValue: [sectionId],
      },
    ]);
  });
  it("rejects subscribeProjectState full selectors and invalid throttle options", async () => {
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
    expectPluginFrontendErrorCode(
      () =>
        host.subscribeProjectState({ kind: "full" }, () => undefined, {
          fireImmediately: false,
        }),
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
    expectPluginFrontendErrorCode(
      () =>
        host.subscribeProjectState(
          { kind: "activeSectionIds" },
          () => undefined,
          {
            throttleMs: -1,
          },
        ),
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });
  it("enforces capability checks for project-state and realtime emit host APIs", async () => {
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
      effectiveCapabilities: [],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    expectPluginFrontendErrorCode(
      () => host.readProjectState({ kind: "projectConfig" }),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
    expectPluginFrontendErrorCode(
      () =>
        host.subscribeProjectState(
          { kind: "activeSectionIds" },
          () => undefined,
          {
            fireImmediately: false,
          },
        ),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
    expectPluginFrontendErrorCode(
      () =>
        host.emitRealtimeDependencyEvent({
          dependencyKey: {
            type: DependencyKeyTypeEnum.Section,
            sectionId: "section-capability",
          },
          payload: {
            type: DependencyValueTypeEnum.Literal,
            payload: "value",
          },
        }),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
    expectPluginFrontendErrorCode(
      () =>
        host.emitSectionRealtimeValue("section-capability", {
          signal: 1,
        }),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
  });
  it("enforces capability checks for section read and update host APIs", async () => {
    const sectionId = "section-runtime-plugin-capability";
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
      effectiveCapabilities: [],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    expectPluginFrontendErrorCode(
      () => host.readSection(sectionId),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
    expectPluginFrontendErrorCode(
      () =>
        host.updateSection(sectionId, {
          kind: "updated-kind",
        }),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
  });
  it("rejects section reads and writes across plugin ownership boundaries", async () => {
    const sectionId = "section-runtime-plugin-owner-check";
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
      pluginId: "other.plugin",
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
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
    expectPluginFrontendErrorCode(
      () =>
        host.updateSection(sectionId, {
          kind: "updated-kind",
        }),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
  });
  it("emits realtime dependency events through websocket action helpers", async () => {
    const realtimeSpy = vi
      .spyOn(realtimeDependencySend, "sendRealtimeDependencyEvent")
      .mockImplementation(() => undefined);
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
      effectiveCapabilities: ["emitListenerEvents"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    host.emitSectionRealtimeValue(
      "section-emit-wrapper",
      { status: "ok", index: 3 },
      {
        timestampMs: 1234,
      },
    );
    host.emitRealtimeDependencyEvent({
      dependencyKey: {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-emit-direct",
      },
      payload: {
        type: DependencyValueTypeEnum.Literal,
        payload: "direct",
      },
      timestampMs: 4321,
    });
    expect(realtimeSpy).toHaveBeenCalledTimes(2);
    expect(realtimeSpy.mock.calls[0]?.[0]).toEqual({
      dependencyKey: {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-emit-wrapper",
      },
      payload: {
        type: DependencyValueTypeEnum.Literal,
        payload: '{"status":"ok","index":3}',
      },
      binaryPayload: undefined,
      timestampMs: 1234,
    });
    expect(realtimeSpy.mock.calls[1]?.[0]).toEqual({
      dependencyKey: {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-emit-direct",
      },
      payload: {
        type: DependencyValueTypeEnum.Literal,
        payload: "direct",
      },
      binaryPayload: undefined,
      timestampMs: 4321,
    });
    expectPluginFrontendErrorCode(
      () =>
        host.emitRealtimeDependencyEvent({
          dependencyKey: {
            type: DependencyKeyTypeEnum.Section,
            sectionId: "section-invalid-binary",
          },
          payload: {
            type: DependencyValueTypeEnum.Binary,
            payload: {
              contentId: "content-1",
              byteLength: 12,
              mimeType: "image/png",
            },
          },
        }),
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });
  it("rejects non-object payloads for emitSectionRealtimeValue", async () => {
    const realtimeSpy = vi
      .spyOn(realtimeDependencySend, "sendRealtimeDependencyEvent")
      .mockImplementation(() => undefined);
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
      effectiveCapabilities: ["emitListenerEvents"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    expectPluginFrontendErrorCode(
      () => host.emitSectionRealtimeValue("section-primitive", "hello"),
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
    expectPluginFrontendErrorCode(
      () => host.emitSectionRealtimeValue("section-array", ["hello"]),
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
    expect(realtimeSpy).not.toHaveBeenCalled();
  });
  it("cleans active plugin subscriptions when runtime reloads", async () => {
    const globalScope = globalThis as {
      __settaCleanupProbe?: {
        callCount: number;
      };
    };
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  globalThis.__settaCleanupProbe = { callCount: 0 };\n" +
          "  host.subscribeProjectState(\n" +
          "    { kind: 'activeSectionIds' },\n" +
          "    () => {\n" +
          "      globalThis.__settaCleanupProbe.callCount += 1;\n" +
          "    },\n" +
          "    { fireImmediately: false }\n" +
          "  );\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["subscribeProjectState"],
    });
    const pluginStatus = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
      requestedCapabilities: ["subscribeProjectState"],
      effectiveCapabilities: ["subscribeProjectState"],
      blockedCapabilities: [],
    });
    let listPayload = buildPluginListResponse([plugin]);
    let statusPayload = buildPluginStatusResponse([pluginStatus]);
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () =>
      buildRuntimeEndpointResponse(listPayload, statusPayload),
    );
    await refreshPluginRuntime();
    useActiveSectionUI.setState({ activeIds: ["section-after-first-load"] });
    expect(globalScope.__settaCleanupProbe?.callCount).toBe(1);
    listPayload = buildPluginListResponse([]);
    statusPayload = buildPluginStatusResponse([]);
    await refreshPluginRuntime();
    useActiveSectionUI.setState({ activeIds: ["section-after-cleanup"] });
    expect(globalScope.__settaCleanupProbe?.callCount).toBe(1);
  });
  it("keeps plugin list entry references stable on no-op runtime refreshes", async () => {
    const plugin = buildPluginListEntry({
      effectiveCapabilities: ["registerSectionKinds", "registerPane"],
    });
    const pluginStatus = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
      requestedCapabilities: ["registerSectionKinds", "registerPane"],
      effectiveCapabilities: ["registerSectionKinds", "registerPane"],
      blockedCapabilities: [],
    });
    const runtimePayload = buildRuntimeEndpointResponse(
      buildPluginListResponse([plugin]),
      buildPluginStatusResponse([pluginStatus]),
    );
    vi.spyOn(openAPI, "getPluginsRuntime").mockResolvedValue(runtimePayload);
    await refreshPluginRuntime();
    const firstEntry =
      usePluginRuntimeStore.getState().pluginListById[plugin.pluginId];
    const firstSortedPluginListEntries =
      usePluginRuntimeStore.getState().sortedPluginListEntries;
    const firstCapabilities = firstEntry?.effectiveCapabilities;
    expect(firstCapabilities).toBeDefined();
    await refreshPluginRuntime();
    const secondState = usePluginRuntimeStore.getState();
    const secondEntry = secondState.pluginListById[plugin.pluginId];
    const secondCapabilities = secondEntry?.effectiveCapabilities;
    expect(secondEntry).toBe(firstEntry);
    expect(secondCapabilities).toBe(firstCapabilities);
    expect(secondState.sortedPluginListEntries).toBe(
      firstSortedPluginListEntries,
    );
  });
  it("reuses plugin list entries when nested payload values are unchanged", async () => {
    const schemaJson = {
      type: "object",
      properties: {
        label: {
          type: "string",
        },
      },
    };
    const firstPlugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: "/plugins/acme.plugin/index.js",
        styleUrl: "/plugins/acme.plugin/index.css",
      },
      content: {
        hasBlueprints: true,
        hasProjectTemplates: true,
        hasPrompts: true,
      },
      config: {
        hasSchema: true,
        schemaJson,
        currentConfig: {
          label: "stable",
        },
      },
      effectiveCapabilities: ["registerSectionKinds", "registerPane"],
    });
    const secondPlugin = buildPluginListEntry({
      ...firstPlugin,
      frontend: { ...firstPlugin.frontend },
      content: { ...firstPlugin.content },
      config: {
        hasSchema: firstPlugin.config.hasSchema,
        schemaJson: { ...schemaJson },
        currentConfig: { ...firstPlugin.config.currentConfig },
      },
      effectiveCapabilities: [...firstPlugin.effectiveCapabilities],
    });
    const pluginStatus = buildPluginStatusEntry({
      pluginId: firstPlugin.pluginId,
      requestedCapabilities: ["registerSectionKinds", "registerPane"],
      effectiveCapabilities: ["registerSectionKinds", "registerPane"],
      blockedCapabilities: [],
    });
    let runtimeCallCount = 0;
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () => {
      runtimeCallCount += 1;
      if (runtimeCallCount === 1) {
        return buildRuntimeEndpointResponse(
          buildPluginListResponse([firstPlugin]),
          buildPluginStatusResponse([pluginStatus]),
        );
      }
      return buildRuntimeEndpointResponse(
        buildPluginListResponse([secondPlugin]),
        buildPluginStatusResponse([pluginStatus]),
      );
    });
    await refreshPluginRuntime();
    const firstEntry =
      usePluginRuntimeStore.getState().pluginListById[firstPlugin.pluginId];
    await refreshPluginRuntime();
    const secondEntry =
      usePluginRuntimeStore.getState().pluginListById[firstPlugin.pluginId];
    expect(secondEntry).toBe(firstEntry);
  });
  it("replaces plugin list entry references when config digest changes", async () => {
    const firstPlugin = buildPluginListEntry({
      config: withPluginConfigDigests(
        {
          hasSchema: true,
          schemaJson: {
            type: "object",
            properties: {
              theme: { type: "string" },
            },
          },
          currentConfig: {
            theme: "light",
          },
        } as PluginListEntry["config"],
        {
          schemaJsonDigestSha256: "schema-digest-a",
          currentConfigDigestSha256: "config-digest-a",
        },
      ),
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const secondPlugin = buildPluginListEntry({
      ...firstPlugin,
      config: withPluginConfigDigests(
        {
          hasSchema: true,
          schemaJson: firstPlugin.config.schemaJson,
          currentConfig: firstPlugin.config.currentConfig,
        } as PluginListEntry["config"],
        {
          schemaJsonDigestSha256: "schema-digest-a",
          currentConfigDigestSha256: "config-digest-b",
        },
      ),
      effectiveCapabilities: [...firstPlugin.effectiveCapabilities],
    });
    const pluginStatus = buildPluginStatusEntry({
      pluginId: firstPlugin.pluginId,
      requestedCapabilities: ["registerSectionKinds"],
      effectiveCapabilities: ["registerSectionKinds"],
      blockedCapabilities: [],
    });
    let runtimeCallCount = 0;
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () => {
      runtimeCallCount += 1;
      if (runtimeCallCount === 1) {
        return buildRuntimeEndpointResponse(
          buildPluginListResponse([firstPlugin]),
          buildPluginStatusResponse([pluginStatus]),
        );
      }
      return buildRuntimeEndpointResponse(
        buildPluginListResponse([secondPlugin]),
        buildPluginStatusResponse([pluginStatus]),
      );
    });
    await refreshPluginRuntime();
    const firstEntry =
      usePluginRuntimeStore.getState().pluginListById[firstPlugin.pluginId];
    await refreshPluginRuntime();
    const secondEntry =
      usePluginRuntimeStore.getState().pluginListById[firstPlugin.pluginId];
    expect(secondEntry).not.toBe(firstEntry);
  });
  it("replaces plugin list entry references when current config payload changes", async () => {
    const firstPlugin = buildPluginListEntry({
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
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const secondPlugin = buildPluginListEntry({
      ...firstPlugin,
      config: {
        hasSchema: true,
        schemaJson: firstPlugin.config.schemaJson,
        currentConfig: {
          theme: "dark",
        },
      },
      effectiveCapabilities: [...firstPlugin.effectiveCapabilities],
    });
    const pluginStatus = buildPluginStatusEntry({
      pluginId: firstPlugin.pluginId,
      requestedCapabilities: ["registerSectionKinds"],
      effectiveCapabilities: ["registerSectionKinds"],
      blockedCapabilities: [],
    });
    let runtimeCallCount = 0;
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () => {
      runtimeCallCount += 1;
      if (runtimeCallCount === 1) {
        return buildRuntimeEndpointResponse(
          buildPluginListResponse([firstPlugin]),
          buildPluginStatusResponse([pluginStatus]),
        );
      }
      return buildRuntimeEndpointResponse(
        buildPluginListResponse([secondPlugin]),
        buildPluginStatusResponse([pluginStatus]),
      );
    });
    await refreshPluginRuntime();
    const firstEntry =
      usePluginRuntimeStore.getState().pluginListById[firstPlugin.pluginId];
    await refreshPluginRuntime();
    const secondEntry =
      usePluginRuntimeStore.getState().pluginListById[firstPlugin.pluginId];
    expect(secondEntry).not.toBe(firstEntry);
    expect(secondEntry?.config.currentConfig).toEqual({
      theme: "dark",
    });
  });
  it("replaces plugin list entry references when runtime list payload changes", async () => {
    const firstPlugin = buildPluginListEntry({
      sourceDigestSha256: "sha256:first",
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const secondPlugin = buildPluginListEntry({
      sourceDigestSha256: "sha256:second",
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const pluginStatus = buildPluginStatusEntry({
      pluginId: firstPlugin.pluginId,
      requestedCapabilities: ["registerSectionKinds"],
      effectiveCapabilities: ["registerSectionKinds"],
      blockedCapabilities: [],
    });
    let runtimeCallCount = 0;
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () => {
      runtimeCallCount += 1;
      if (runtimeCallCount === 1) {
        return buildRuntimeEndpointResponse(
          buildPluginListResponse([firstPlugin]),
          buildPluginStatusResponse([pluginStatus]),
        );
      }
      return buildRuntimeEndpointResponse(
        buildPluginListResponse([secondPlugin]),
        buildPluginStatusResponse([pluginStatus]),
      );
    });
    await refreshPluginRuntime();
    const firstEntry =
      usePluginRuntimeStore.getState().pluginListById[firstPlugin.pluginId];
    await refreshPluginRuntime();
    const secondEntry =
      usePluginRuntimeStore.getState().pluginListById[firstPlugin.pluginId];
    expect(secondEntry).not.toBe(firstEntry);
    expect(secondEntry?.sourceDigestSha256).toBe("sha256:second");
  });
  it("uses runtime payload plugin ordering without frontend resorting", async () => {
    const beta = buildPluginListEntry({
      pluginId: "beta.plugin",
    });
    const alpha = buildPluginListEntry({
      pluginId: "alpha.plugin",
    });
    const betaStatus = buildPluginStatusEntry({
      pluginId: "beta.plugin",
    });
    const alphaStatus = buildPluginStatusEntry({
      pluginId: "alpha.plugin",
    });
    vi.spyOn(openAPI, "getPluginsRuntime").mockResolvedValue(
      buildRuntimeEndpointResponse(
        buildPluginListResponse([beta, alpha]),
        buildPluginStatusResponse([betaStatus, alphaStatus]),
      ),
    );
    await refreshPluginRuntime();
    expect(
      usePluginRuntimeStore
        .getState()
        .sortedPluginListEntries.map((entry) => entry.pluginId),
    ).toEqual(["beta.plugin", "alpha.plugin"]);
  });
  it("sorts same-title section kinds by plugin id then kind", async () => {
    const alphaModuleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  host.registerSectionKind({ kind: 'kind-z', title: 'Shared', renderer: { mount() {} } });\n" +
          "  host.registerSectionKind({ kind: 'kind-b', title: 'Shared', renderer: { mount() {} } });\n" +
          "}\n",
      );
    const betaModuleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  host.registerSectionKind({ kind: 'kind-a', title: 'Shared', renderer: { mount() {} } });\n" +
          "}\n",
      );
    const alpha = buildPluginListEntry({
      pluginId: "alpha.plugin",
      frontend: {
        entrypointUrl: alphaModuleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const beta = buildPluginListEntry({
      pluginId: "beta.plugin",
      frontend: {
        entrypointUrl: betaModuleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerSectionKinds"],
    });
    const alphaStatus = buildPluginStatusEntry({
      pluginId: "alpha.plugin",
      requestedCapabilities: ["registerSectionKinds"],
      effectiveCapabilities: ["registerSectionKinds"],
      blockedCapabilities: [],
    });
    const betaStatus = buildPluginStatusEntry({
      pluginId: "beta.plugin",
      requestedCapabilities: ["registerSectionKinds"],
      effectiveCapabilities: ["registerSectionKinds"],
      blockedCapabilities: [],
    });
    vi.spyOn(openAPI, "getPluginsRuntime").mockResolvedValue(
      buildRuntimeEndpointResponse(
        buildPluginListResponse([alpha, beta]),
        buildPluginStatusResponse([alphaStatus, betaStatus]),
      ),
    );
    await refreshPluginRuntime();
    expect(
      usePluginRuntimeStore
        .getState()
        .sortedSectionKinds.map(
          (entry) => `${entry.title}:${entry.pluginId}:${entry.kind}`,
        ),
    ).toEqual([
      "Shared:alpha.plugin:kind-b",
      "Shared:alpha.plugin:kind-z",
      "Shared:beta.plugin:kind-a",
    ]);
  });
});
