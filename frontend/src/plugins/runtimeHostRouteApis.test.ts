import { syncStoreInitialState } from "components/Panes/paneTestUtils";
import * as openAPI from "openapi/http";
import {
  resetAppSubsystemFrontendRuntimeState,
  useAppSubsystemFrontendStore,
} from "plugins/appSubsystem";
import { usePluginRuntimeStore } from "plugins/runtime";
import {
  clearPluginRuntimeSideEffects,
  loadPluginFrontendModule,
} from "plugins/runtimeInternal";
import { PluginFrontendErrorCodeEnum } from "plugins/runtimeShared";
import React from "react";
import { renderToString } from "react-dom/server";
import { loadProjectState } from "state/actions/project/loadProject";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState, useShareSession } from "state/definitions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type StateCreator, type StoreApi } from "zustand/vanilla";
import {
  buildPluginListEntry,
  buildPluginRuntimeProjectState,
  expectPluginFrontendErrorCode,
  RuntimeTestWebSocket,
  seedRuntimePluginSectionState,
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

function pluginModuleUrl(source: string): string {
  return "data:text/javascript," + encodeURIComponent(source);
}

async function loadCapturedHostPlugin(
  effectiveCapabilities: string[] = [],
): Promise<CapturedPluginHost> {
  const result = await loadPluginFrontendModule(
    buildPluginListEntry({
      frontend: {
        entrypointUrl: pluginModuleUrl(
          "export const apiVersion = 1;\n" +
            "export function register(host) {\n" +
            "  globalThis.__settaCapturedPluginHost = host;\n" +
            "}\n",
        ),
        styleUrl: null,
      },
      effectiveCapabilities,
    }),
    "ide",
  );
  expect(result?.error).toBeNull();
  return getCapturedPluginHost();
}

function fetchCall(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  const call = fetchMock.mock.calls[index];
  if (!call) {
    throw new Error(`Expected fetch call ${index}.`);
  }
  return call;
}

async function expectInvalidBackendRoutes(host: CapturedPluginHost) {
  await expect(
    host.fetchBackendRoute("watch-code/inputs"),
  ).rejects.toMatchObject({
    code: PluginFrontendErrorCodeEnum.RegistrationInvalid,
  });
  await expect(host.fetchBackendRoute("/../admin")).rejects.toMatchObject({
    code: PluginFrontendErrorCodeEnum.RegistrationInvalid,
  });
  await expect(host.fetchBackendRoute("/%2e%2e/admin")).rejects.toMatchObject({
    code: PluginFrontendErrorCodeEnum.RegistrationInvalid,
  });
}
describe("plugin runtime host route APIs", () => {
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
  it("fetches plugin-owned backend routes through the generic host route helper", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const host = await loadCapturedHostPlugin(["registerRouter"]);

    await expect(
      host.fetchBackendRoute("/watch-code/inputs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectConfigId: "project-alpha",
          folders: [{ path: "pkg", recursive: true }],
          files: ["pkg/mod.py"],
        }),
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(host.fetchBackendRoute("/health")).resolves.toMatchObject({
      status: 200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const watchCodeCall = fetchCall(fetchMock, 0);
    expect(String(watchCodeCall[0])).toContain(
      "/plugins/acme.plugin/watch-code/inputs",
    );
    expect(watchCodeCall[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({
        projectConfigId: "project-alpha",
        folders: [{ path: "pkg", recursive: true }],
        files: ["pkg/mod.py"],
      }),
    });
    expect(watchCodeCall[1]?.headers).toBeInstanceOf(Headers);
    expect((watchCodeCall[1]?.headers as Headers).get("Content-Type")).toBe(
      "application/json",
    );
    const healthCall = fetchCall(fetchMock, 1);
    expect(String(healthCall[0])).toContain("/plugins/acme.plugin/health");
    expect(healthCall[1]).toMatchObject({
      credentials: "include",
    });
    await expectInvalidBackendRoutes(host);
  });
  it("exposes createStore on the plugin host", async () => {
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
    const store = host.createStore(() => ({
      count: 1,
      label: "fixture",
    }));
    expect(store.getState()).toEqual({
      count: 1,
      label: "fixture",
    });
    store.setState((state) => ({
      count: state.count + 2,
    }));
    expect(store.getState()).toEqual({
      count: 3,
      label: "fixture",
    });
  });
  it("supports project-context subscriptions and readSection snapshots", async () => {
    const sectionId = "section-runtime-dict";
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
    const firstRead = host.readSection(sectionId);
    (
      firstRead as {
        data: {
          text: string;
        };
      }
    ).data.text = "mutated-client-only";
    const secondRead = host.readSection(sectionId);
    expect(
      (
        secondRead as {
          data: {
            text: string;
          };
        }
      ).data.text,
    ).toBe("initial");
    const observedContexts: Array<{
      projectConfigId: string;
      serverMode: string;
    }> = [];
    const unsubscribe = host.subscribeProjectContext((context) => {
      observedContexts.push(context);
    });
    useProjectState.setState((state) => {
      state.projectConfig.name = "project-name-updated";
    });
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-updated";
    });
    unsubscribe();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-after-unsubscribe";
    });
    expect(observedContexts).toEqual([
      {
        projectConfigId: "project-config-updated",
        serverMode: "ide",
      },
    ]);
  });
  it("supports readProjectState selectors and returns cloned snapshots", async () => {
    const sectionId = "section-runtime-plugin-read";
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
    const projectConfigSnapshot = host.readProjectState({
      kind: "projectConfig",
    }) as {
      id: string;
      activeIds: string[];
    };
    expect(projectConfigSnapshot.id).toBe("project-config-plugin-initial");
    projectConfigSnapshot.id = "mutated-client-only";
    projectConfigSnapshot.activeIds.push("mutated");
    const refreshedProjectConfig = host.readProjectState({
      kind: "projectConfig",
    }) as {
      id: string;
      activeIds: string[];
    };
    expect(refreshedProjectConfig.id).toBe("project-config-plugin-initial");
    expect(refreshedProjectConfig.activeIds).toEqual([]);
    const sectionSnapshot = host.readProjectState({
      kind: "section",
      sectionId,
    }) as {
      data: {
        text: string;
      };
    };
    sectionSnapshot.data.text = "mutated-client-only";
    const refreshedSectionSnapshot = host.readProjectState({
      kind: "section",
      sectionId,
    }) as {
      data: {
        text: string;
      };
    };
    expect(refreshedSectionSnapshot.data.text).toBe("initial");
    const sectionsSnapshot = host.readProjectState({
      kind: "sections",
      sectionIds: [sectionId, "missing-section"],
    }) as Record<string, unknown>;
    expect(sectionsSnapshot[sectionId]).toBeTypeOf("object");
    expect(sectionsSnapshot["missing-section"]).toBeNull();
    expectPluginFrontendErrorCode(
      () => host.readProjectState({ kind: "full" }),
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });
  it("supports subscribeProjectState updates and unsubscribes cleanly", async () => {
    const sectionId = "section-runtime-plugin-subscribe";
    seedRuntimePluginSectionState(sectionId);
    useActiveSectionUI.setState({ activeIds: [] });
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
    useActiveSectionUI.setState({ activeIds: [sectionId] });
    useActiveSectionUI.setState({ activeIds: [sectionId, "section-next"] });
    unsubscribe();
    useActiveSectionUI.setState({ activeIds: ["section-after-unsubscribe"] });
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual({
      nextValue: [sectionId],
      prevValue: [],
    });
    expect(updates[1]).toEqual({
      nextValue: [sectionId, "section-next"],
      prevValue: [sectionId],
    });
  });
  it("notifies pluginData subscribers when the active project changes with the same payload", async () => {
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
      { kind: "pluginData", pluginId: "setta-watch-code" },
      (nextValue, prevValue) => {
        updates.push({ nextValue, prevValue });
      },
      {
        fireImmediately: false,
      },
    );
    await loadProjectState(
      buildPluginRuntimeProjectState("project-config-plugin-next", [], []),
    );
    unsubscribe();

    expect(updates).toEqual([
      {
        nextValue: null,
        prevValue: null,
      },
    ]);
  });
  it("keeps projectConfig subscriptions structural while activeSectionIds stays live", async () => {
    const sectionId = "section-runtime-plugin-project-config";
    seedRuntimePluginSectionState(sectionId);
    useActiveSectionUI.setState({ activeIds: [] });
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
      effectiveCapabilities: ["readProjectState", "subscribeProjectState"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    const projectConfigUpdates: Array<{
      nextValue: unknown;
      prevValue: unknown | null;
    }> = [];
    const activeSelectionUpdates: Array<{
      nextValue: unknown;
      prevValue: unknown | null;
    }> = [];
    const unsubscribeProjectConfig = host.subscribeProjectState(
      { kind: "projectConfig" },
      (nextValue, prevValue) => {
        projectConfigUpdates.push({ nextValue, prevValue });
      },
      {
        fireImmediately: false,
      },
    );
    const unsubscribeActiveIds = host.subscribeProjectState(
      { kind: "activeSectionIds" },
      (nextValue, prevValue) => {
        activeSelectionUpdates.push({ nextValue, prevValue });
      },
      {
        fireImmediately: false,
      },
    );
    useActiveSectionUI.setState({ activeIds: [sectionId] });
    expect(
      host.readProjectState({
        kind: "projectConfig",
      }) as {
        activeIds: string[];
      },
    ).toMatchObject({
      activeIds: [],
    });
    expect(projectConfigUpdates).toEqual([]);
    expect(activeSelectionUpdates).toEqual([
      {
        nextValue: [sectionId],
        prevValue: [],
      },
    ]);
    unsubscribeProjectConfig();
    unsubscribeActiveIds();
  });
  it("keeps projectConfig subscription reads coherent during atomic project publication", async () => {
    const initialSectionId = "section-runtime-plugin-before";
    const nextSectionId = "section-runtime-plugin-after";
    seedRuntimePluginSectionState(initialSectionId);
    useActiveSectionUI.setState({ activeIds: [initialSectionId] });
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
      effectiveCapabilities: ["readProjectState", "subscribeProjectState"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const host = getCapturedPluginHost();
    const observedSnapshots: Array<{
      projectConfigId: string;
      activeIds: string[];
    }> = [];
    const unsubscribe = host.subscribeProjectState(
      { kind: "projectConfig" },
      (nextValue) => {
        observedSnapshots.push({
          projectConfigId: (
            nextValue as {
              id: string;
            }
          ).id,
          activeIds: [
            ...((host.readProjectState({
              kind: "activeSectionIds",
            }) as string[]) ?? []),
          ],
        });
      },
      {
        fireImmediately: false,
      },
    );
    await loadProjectState(
      buildPluginRuntimeProjectState(
        "project-config-plugin-next",
        [nextSectionId],
        [nextSectionId],
      ),
    );
    unsubscribe();
    expect(observedSnapshots).toEqual([
      {
        projectConfigId: "project-config-plugin-next",
        activeIds: [nextSectionId],
      },
    ]);
  });
});
