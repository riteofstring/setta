import { syncStoreInitialState } from "components/Panes/paneTestUtils";
import * as openAPI from "openapi/http";
import {
  applyAppDefinitionStructuredContentToStore,
  appSubsystemModeRequiresImageAttachment,
  createAppSubsystemFrontendHost,
  initializeAppSessionFromCurrentDeployment,
  processAppProjectStateUpdateFromBackend,
  resetAppSubsystemFrontendRuntimeState,
  useAppSubsystemAppDeploymentModal,
  useAppSubsystemFrontendStore,
  useAppSubsystemOverviewTab,
  useAppSubsystemSlashCommands,
} from "plugins/appSubsystem";
import {
  receivePluginRuntimeUpdate,
  usePluginRuntimeStore,
} from "plugins/runtime";
import * as runtimeInternal from "plugins/runtimeInternal";
import {
  clearPluginRuntimeSideEffects,
  loadPluginFrontendModule,
} from "plugins/runtimeInternal";
import React from "react";
import { renderToString } from "react-dom/server";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState, useShareSession } from "state/definitions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type StateCreator, type StoreApi } from "zustand/vanilla";
import {
  buildActiveAppSubsystemCapabilities,
  buildAppSubsystemRegistrationDelta,
  buildPluginListEntry,
  buildPluginListResponse,
  buildPluginRuntimeResponse,
  buildPluginStatusEntry,
  buildPluginStatusResponse,
  buildUnavailableWatchCodeCapabilities,
  deferred,
  RuntimeTestWebSocket,
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

describe("plugin runtime app-subsystem frontend loading", () => {
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
  it("loads app-subsystem frontend surfaces from runtime metadata for unknown provider ids", async () => {
    const providerPluginId = "acme.third-party-app-provider";
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  host.registerAppSubsystem({\n" +
          "    overviewTab: {\n" +
          "      renderer: { mount() {} },\n" +
          "      titleQuickInfo: 'Acme provider quick info',\n" +
          "      moreMenuQuickInfo: 'Open Acme app configuration.',\n" +
          "      moreMenuLabel: 'Acme App'\n" +
          "    },\n" +
          "    previewSurface: { renderer: { mount() {} } },\n" +
          "    appModeRoute: { renderer: { mount() {} } },\n" +
          "    appDeploymentModal: { renderer: { mount() {} } },\n" +
          "    chat: {\n" +
          "      slashCommands: [{\n" +
          "        command: '/app-json',\n" +
          "        action: 'app_json_render',\n" +
          "        summary: 'Generate a standalone app spec through JSON render.',\n" +
          "        promptTemplate: 'Generate a polished standalone JSON-render app spec. Use a strong hero section, clear content grouping, and consistent spacing/typography by default. Include one obvious primary action path and production-ready baseline structure.',\n" +
          "        appGenerationMode: 'json_render'\n" +
          "      }],\n" +
          "      imageRequiredModes: [],\n" +
          "      customSlashCommandModes: {\n" +
          "        options: [\n" +
          "          { id: 'plain_chat', name: 'Plain chat' },\n" +
          "          { id: 'json_render', name: 'JSON Render' }\n" +
          "        ],\n" +
          "        defaultMode: 'plain_chat'\n" +
          "      }\n" +
          "    },\n" +
          "    controller: {\n" +
          "      getPreviewEnabled: function() { return true; },\n" +
          "      initializeAppSessionFromCurrentDeployment: async function() { return true; }\n" +
          "    }\n" +
          "  });\n" +
          "}\n",
      );

    await receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            pluginId: providerPluginId,
            name: "Acme App Provider",
            frontend: {
              entrypointUrl: moduleUrl,
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: providerPluginId,
            name: "Acme App Provider",
          }),
        ]),
        {
          featureCapabilities: {
            appSubsystem: {
              providerSelection: {
                status: "active",
                selectedPluginId: providerPluginId,
                activePluginIds: [providerPluginId],
                disabledPluginIds: [],
                invalidPluginIds: [],
                conflictingPluginIds: [],
              },
              pluginId: providerPluginId,
              pluginEnabled: true,
              appAuthoringUi: true,
              appPreviewUi: true,
              appGenerationChatModes: true,
              appDeploymentRuntime: true,
            },
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    expect(
      readAppSubsystemHookValue(() => useAppSubsystemOverviewTab()),
    ).toMatchObject({
      moreMenuLabel: "Acme App",
    });
    expect(
      readAppSubsystemHookValue(() => useAppSubsystemSlashCommands()).map(
        (entry) => entry.command,
      ),
    ).toEqual(["/app-json"]);
    expect(
      readAppSubsystemHookValue(() => useAppSubsystemAppDeploymentModal()),
    ).not.toBeNull();
    expect(appSubsystemModeRequiresImageAttachment("json_render")).toBe(false);
  });
  it("buffers app-subsystem updates while the selected provider frontend is still importing", async () => {
    const providerPluginId = "acme.loading-app-provider";
    const applyStructuredContent = vi.fn(() => true);
    const loadStarted = deferred();
    const releaseLoad = deferred();

    vi.spyOn(runtimeInternal, "loadPluginFrontendModule").mockImplementation(
      async (plugin) => {
        if (plugin.pluginId !== providerPluginId) {
          return {
            error: null,
            registryDelta: {
              appSubsystemRegistrationsByPluginId: {},
              sectionKinds: {},
              panes: {},
              commands: {},
              topNavBarItems: {},
              canvasControls: {},
            },
          };
        }
        loadStarted.resolve();
        await releaseLoad.promise;
        return {
          error: null,
          registryDelta: buildAppSubsystemRegistrationDelta(
            providerPluginId,
            applyStructuredContent,
          ),
        };
      },
    );

    const updatePromise = receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            pluginId: providerPluginId,
            name: "Loading App Provider",
            frontend: {
              entrypointUrl: "/plugins/acme.loading/index.js",
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: providerPluginId,
            name: "Loading App Provider",
          }),
        ]),
        {
          featureCapabilities: {
            appSubsystem: buildActiveAppSubsystemCapabilities(providerPluginId),
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    await loadStarted.promise;
    expect(useAppSubsystemFrontendStore.getState().status).toBe("loading");

    expect(
      applyAppDefinitionStructuredContentToStore({
        appSpec: { title: "Buffered update" },
      }),
    ).toBe(true);
    expect(applyStructuredContent).not.toHaveBeenCalled();

    releaseLoad.resolve();
    await updatePromise;

    expect(applyStructuredContent).toHaveBeenCalledWith({
      appSpec: { title: "Buffered update" },
    });
    expect(useAppSubsystemFrontendStore.getState()).toMatchObject({
      status: "loaded",
      registration: {
        pluginId: providerPluginId,
      },
    });
  });
  it("drops queued app-subsystem updates when the provider changes before the first frontend load finishes", async () => {
    const firstProviderPluginId = "acme.loading-app-provider-a";
    const secondProviderPluginId = "acme.loading-app-provider-b";
    const applyStructuredContentA = vi.fn(() => true);
    const applyStructuredContentB = vi.fn(() => true);
    const firstLoadStarted = deferred();
    const releaseFirstLoad = deferred();
    const secondLoadStarted = deferred();
    const releaseSecondLoad = deferred();

    vi.spyOn(runtimeInternal, "loadPluginFrontendModule").mockImplementation(
      async (plugin) => {
        if (plugin.pluginId === firstProviderPluginId) {
          firstLoadStarted.resolve();
          await releaseFirstLoad.promise;
          return {
            error: null,
            registryDelta: buildAppSubsystemRegistrationDelta(
              firstProviderPluginId,
              applyStructuredContentA,
            ),
          };
        }
        if (plugin.pluginId === secondProviderPluginId) {
          secondLoadStarted.resolve();
          await releaseSecondLoad.promise;
          return {
            error: null,
            registryDelta: buildAppSubsystemRegistrationDelta(
              secondProviderPluginId,
              applyStructuredContentB,
            ),
          };
        }
        return {
          error: null,
          registryDelta: {
            appSubsystemRegistrationsByPluginId: {},
            sectionKinds: {},
            panes: {},
            commands: {},
            topNavBarItems: {},
            canvasControls: {},
          },
        };
      },
    );

    const firstUpdatePromise = receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            pluginId: firstProviderPluginId,
            name: "First Loading App Provider",
            frontend: {
              entrypointUrl: "/plugins/acme.loading-a/index.js",
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: firstProviderPluginId,
            name: "First Loading App Provider",
          }),
        ]),
        {
          featureCapabilities: {
            appSubsystem: buildActiveAppSubsystemCapabilities(
              firstProviderPluginId,
            ),
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    await firstLoadStarted.promise;
    expect(
      applyAppDefinitionStructuredContentToStore({
        appSpec: { title: "Stale update" },
      }),
    ).toBe(true);

    const secondUpdatePromise = receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            pluginId: secondProviderPluginId,
            name: "Second Loading App Provider",
            frontend: {
              entrypointUrl: "/plugins/acme.loading-b/index.js",
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: secondProviderPluginId,
            name: "Second Loading App Provider",
          }),
        ]),
        {
          featureCapabilities: {
            appSubsystem: buildActiveAppSubsystemCapabilities(
              secondProviderPluginId,
            ),
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    releaseFirstLoad.resolve();
    await secondLoadStarted.promise;

    expect(useAppSubsystemFrontendStore.getState()).toMatchObject({
      status: "loading",
      registration: null,
      capabilities: {
        pluginId: secondProviderPluginId,
      },
    });

    releaseSecondLoad.resolve();
    await firstUpdatePromise;
    await secondUpdatePromise;

    expect(applyStructuredContentA).not.toHaveBeenCalled();
    expect(applyStructuredContentB).not.toHaveBeenCalled();
    expect(useAppSubsystemFrontendStore.getState()).toMatchObject({
      status: "loaded",
      registration: {
        pluginId: secondProviderPluginId,
      },
    });
  });

  it("buffers app-subsystem updates during same-provider frontend reloads", async () => {
    const providerPluginId = "acme.reloadable-app-provider";
    const firstApplyStructuredContent = vi.fn(() => true);
    const firstProcessProjectStateUpdate = vi.fn();
    const secondApplyStructuredContent = vi.fn(() => true);
    const secondProcessProjectStateUpdate = vi.fn();
    const secondLoadStarted = deferred();
    const releaseSecondLoad = deferred();

    vi.spyOn(runtimeInternal, "loadPluginFrontendModule").mockImplementation(
      async (plugin) => {
        if (plugin.pluginId !== providerPluginId) {
          return {
            error: null,
            registryDelta: {
              appSubsystemRegistrationsByPluginId: {},
              sectionKinds: {},
              panes: {},
              commands: {},
              topNavBarItems: {},
              canvasControls: {},
            },
          };
        }
        if (plugin.sourceDigestSha256 === "digest-b") {
          secondLoadStarted.resolve();
          await releaseSecondLoad.promise;
          return {
            error: null,
            registryDelta: buildAppSubsystemRegistrationDelta(
              providerPluginId,
              secondApplyStructuredContent,
              secondProcessProjectStateUpdate,
            ),
          };
        }
        return {
          error: null,
          registryDelta: buildAppSubsystemRegistrationDelta(
            providerPluginId,
            firstApplyStructuredContent,
            firstProcessProjectStateUpdate,
          ),
        };
      },
    );

    await receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            pluginId: providerPluginId,
            name: "Reloadable App Provider",
            sourceDigestSha256: "digest-a",
            frontend: {
              entrypointUrl: "/plugins/acme.reloadable/index.js",
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: providerPluginId,
            name: "Reloadable App Provider",
          }),
        ]),
        {
          featureCapabilities: {
            appSubsystem: buildActiveAppSubsystemCapabilities(providerPluginId),
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    expect(useAppSubsystemFrontendStore.getState().status).toBe("loaded");

    const secondUpdatePromise = receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            pluginId: providerPluginId,
            name: "Reloadable App Provider",
            sourceDigestSha256: "digest-b",
            frontend: {
              entrypointUrl: "/plugins/acme.reloadable/index.js",
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: providerPluginId,
            name: "Reloadable App Provider",
          }),
        ]),
        {
          featureCapabilities: {
            appSubsystem: buildActiveAppSubsystemCapabilities(providerPluginId),
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    await secondLoadStarted.promise;
    expect(useAppSubsystemFrontendStore.getState().status).toBe("loading");

    expect(
      applyAppDefinitionStructuredContentToStore({
        appSpec: { title: "Buffered during reload" },
      }),
    ).toBe(true);
    processAppProjectStateUpdateFromBackend(
      {} as Parameters<typeof processAppProjectStateUpdateFromBackend>[0],
    );
    expect(firstApplyStructuredContent).not.toHaveBeenCalled();
    expect(firstProcessProjectStateUpdate).not.toHaveBeenCalled();

    releaseSecondLoad.resolve();
    await secondUpdatePromise;

    expect(secondApplyStructuredContent).toHaveBeenCalledWith({
      appSpec: { title: "Buffered during reload" },
    });
    expect(secondProcessProjectStateUpdate).toHaveBeenCalledTimes(1);
    expect(useAppSubsystemFrontendStore.getState()).toMatchObject({
      status: "loaded",
      registration: {
        pluginId: providerPluginId,
      },
    });
  });

  it("preserves buffered app-subsystem updates queued before a same-provider reload starts", async () => {
    const providerPluginId = "acme.reloadable-buffered-provider";
    const firstApplyStructuredContent = vi.fn(() => true);
    const firstProcessProjectStateUpdate = vi.fn();
    const secondApplyStructuredContent = vi.fn(() => true);
    const secondProcessProjectStateUpdate = vi.fn();
    const firstLoadStarted = deferred();
    const releaseFirstLoad = deferred();
    const secondLoadStarted = deferred();
    const releaseSecondLoad = deferred();

    vi.spyOn(runtimeInternal, "loadPluginFrontendModule").mockImplementation(
      async (plugin) => {
        if (plugin.pluginId !== providerPluginId) {
          return {
            error: null,
            registryDelta: {
              appSubsystemRegistrationsByPluginId: {},
              sectionKinds: {},
              panes: {},
              commands: {},
              topNavBarItems: {},
              canvasControls: {},
            },
          };
        }
        if (plugin.sourceDigestSha256 === "digest-a") {
          firstLoadStarted.resolve();
          await releaseFirstLoad.promise;
          return {
            error: null,
            registryDelta: buildAppSubsystemRegistrationDelta(
              providerPluginId,
              firstApplyStructuredContent,
              firstProcessProjectStateUpdate,
            ),
          };
        }
        if (plugin.sourceDigestSha256 === "digest-b") {
          secondLoadStarted.resolve();
          await releaseSecondLoad.promise;
          return {
            error: null,
            registryDelta: buildAppSubsystemRegistrationDelta(
              providerPluginId,
              secondApplyStructuredContent,
              secondProcessProjectStateUpdate,
            ),
          };
        }
        throw new Error(`Unexpected digest ${plugin.sourceDigestSha256}`);
      },
    );

    const firstUpdatePromise = receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            pluginId: providerPluginId,
            name: "Reloadable Buffered Provider",
            sourceDigestSha256: "digest-a",
            frontend: {
              entrypointUrl: "/plugins/acme.reloadable/index.js",
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: providerPluginId,
            name: "Reloadable Buffered Provider",
          }),
        ]),
        {
          featureCapabilities: {
            appSubsystem: buildActiveAppSubsystemCapabilities(providerPluginId),
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    await firstLoadStarted.promise;
    const payload = {} as Parameters<
      typeof processAppProjectStateUpdateFromBackend
    >[0];

    expect(
      applyAppDefinitionStructuredContentToStore({
        appSpec: { title: "Buffered before reload" },
      }),
    ).toBe(true);
    processAppProjectStateUpdateFromBackend(payload);

    const secondUpdatePromise = receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            pluginId: providerPluginId,
            name: "Reloadable Buffered Provider",
            sourceDigestSha256: "digest-b",
            frontend: {
              entrypointUrl: "/plugins/acme.reloadable/index.js",
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: providerPluginId,
            name: "Reloadable Buffered Provider",
          }),
        ]),
        {
          featureCapabilities: {
            appSubsystem: buildActiveAppSubsystemCapabilities(providerPluginId),
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    releaseFirstLoad.resolve();
    await secondLoadStarted.promise;
    releaseSecondLoad.resolve();
    await firstUpdatePromise;
    await secondUpdatePromise;

    expect(firstApplyStructuredContent).not.toHaveBeenCalled();
    expect(firstProcessProjectStateUpdate).not.toHaveBeenCalled();
    expect(secondApplyStructuredContent).toHaveBeenCalledWith({
      appSpec: { title: "Buffered before reload" },
    });
    expect(secondProcessProjectStateUpdate).toHaveBeenCalledWith(payload);
    expect(useAppSubsystemFrontendStore.getState()).toMatchObject({
      status: "loaded",
      registration: {
        pluginId: providerPluginId,
      },
    });
  });

  it("keeps app-session initialization waiting across same-provider reloads", async () => {
    const providerPluginId = "acme.reloadable-session-provider";
    const firstInitializeAppSession = vi.fn(async () => true);
    const secondInitializeAppSession = vi.fn(async () => true);
    const firstLoadStarted = deferred();
    const releaseFirstLoad = deferred();
    const secondLoadStarted = deferred();
    const releaseSecondLoad = deferred();

    vi.spyOn(runtimeInternal, "loadPluginFrontendModule").mockImplementation(
      async (plugin) => {
        if (plugin.pluginId !== providerPluginId) {
          return {
            error: null,
            registryDelta: {
              appSubsystemRegistrationsByPluginId: {},
              sectionKinds: {},
              panes: {},
              commands: {},
              topNavBarItems: {},
              canvasControls: {},
            },
          };
        }
        if (plugin.sourceDigestSha256 === "digest-a") {
          firstLoadStarted.resolve();
          await releaseFirstLoad.promise;
          return {
            error: null,
            registryDelta: buildAppSubsystemRegistrationDelta(
              providerPluginId,
              () => true,
              undefined,
              firstInitializeAppSession,
            ),
          };
        }
        if (plugin.sourceDigestSha256 === "digest-b") {
          secondLoadStarted.resolve();
          await releaseSecondLoad.promise;
          return {
            error: null,
            registryDelta: buildAppSubsystemRegistrationDelta(
              providerPluginId,
              () => true,
              undefined,
              secondInitializeAppSession,
            ),
          };
        }
        throw new Error(`Unexpected digest ${plugin.sourceDigestSha256}`);
      },
    );

    const firstUpdatePromise = receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            pluginId: providerPluginId,
            name: "Reloadable Session Provider",
            sourceDigestSha256: "digest-a",
            frontend: {
              entrypointUrl: "/plugins/acme.reloadable/index.js",
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: providerPluginId,
            name: "Reloadable Session Provider",
          }),
        ]),
        {
          featureCapabilities: {
            appSubsystem: buildActiveAppSubsystemCapabilities(providerPluginId),
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    await firstLoadStarted.promise;
    const frontendHost = createAppSubsystemFrontendHost();
    const initializeSessionPromise = initializeAppSessionFromCurrentDeployment(
      frontendHost,
      {
        forceNewSession: true,
      },
    );

    const secondUpdatePromise = receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntry({
            pluginId: providerPluginId,
            name: "Reloadable Session Provider",
            sourceDigestSha256: "digest-b",
            frontend: {
              entrypointUrl: "/plugins/acme.reloadable/index.js",
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: providerPluginId,
            name: "Reloadable Session Provider",
          }),
        ]),
        {
          featureCapabilities: {
            appSubsystem: buildActiveAppSubsystemCapabilities(providerPluginId),
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    releaseFirstLoad.resolve();
    await secondLoadStarted.promise;
    releaseSecondLoad.resolve();

    await expect(initializeSessionPromise).resolves.toBe(true);
    await firstUpdatePromise;
    await secondUpdatePromise;

    expect(firstInitializeAppSession).not.toHaveBeenCalled();
    expect(secondInitializeAppSession).toHaveBeenCalledTimes(1);
    expect(secondInitializeAppSession).toHaveBeenCalledWith(frontendHost, {
      forceNewSession: true,
    });
  });
});
