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
import {
  createProjectStateBackendUpdate,
  type ProjectStateBackendUpdate,
} from "testUtils/projectStateBackendUpdate";
import {
  createCore,
  createDictSectionImpl,
  createPluginListEntry,
  createPluginStatusEntry,
  createProjectChatWindowingState,
  createProjectConfig,
  createSingletonSections,
  createVariant,
  PluginRuntimeStateEnum,
  type PluginListEntry,
  type PluginListResponse,
  type PluginRestartCapability,
  type PluginRuntimeResponse,
  type PluginStatusEntry,
  type PluginStatusResponse,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type StateCreator, type StoreApi } from "zustand/vanilla";

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
    sourceManager: "setta",
    sourceManagerHint: null,
    sourcePath: "/tmp/acme.plugin",
    canonicalSourceKey: "github:acme/plugin",
    sourceDigestSha256: null,
    shadowedBySourcePath: null,
    requestedCapabilities: [],
    effectiveCapabilities: [],
    blockedCapabilities: [],
    components: [],
    registeredCodegenTargets: [],
    registeredLanguageServers: [],
    registeredBackendRoutes: [],
    registeredStaticDirs: [],
    registeredListenerEndpoints: [],
    enablementSource: null,
    runtimePayloadDigestSha256: "digest-acme-plugin",
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
    sourceManager: "setta",
    sourceManagerHint: null,
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
      schemaJson: {},
      schemaJsonDigestSha256: null,
      currentConfig: {},
      currentConfigDigestSha256: null,
    },
    components: [],
    effectiveCapabilities: [],
    enablementSource: null,
    restartRequired: false,
    ...overrides,
  });
}
function withPluginConfigDigests(
  config: PluginListEntry["config"],
  overrides: {
    schemaJsonDigestSha256?: string | null;
    currentConfigDigestSha256?: string | null;
  },
): PluginListEntry["config"] {
  return {
    ...config,
    ...overrides,
  } as PluginListEntry["config"];
}
function withStatusPayloadDigest(
  statusEntry: PluginStatusEntry,
  digest: string,
): PluginStatusEntry {
  return {
    ...statusEntry,
    runtimePayloadDigestSha256: digest,
  } as PluginStatusEntry;
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
    restartCapability: {
      mode: "manual",
      command: "setta",
      reason: "Programmatic restart is not available in this runtime.",
    } as PluginRestartCapability,
    plugins,
    languageServerSelections: [],
    ...overrides,
  };
}
function buildPluginRuntimeResponse(
  list: PluginListResponse,
  status: PluginStatusResponse,
  overrides: Partial<PluginRuntimeResponse> = {},
): PluginRuntimeResponse {
  return {
    schemaVersion: 1,
    list,
    status,
    ...overrides,
  };
}
function buildRuntimeEndpointResponse(
  list: PluginListResponse,
  status: PluginStatusResponse,
): Awaited<ReturnType<typeof openAPI.getPluginsRuntime>> {
  return {
    data: buildPluginRuntimeResponse(list, status),
    response: new Response(null, { status: 200 }),
  };
}
function buildRuntimeEndpointResponseWithWatchCode(
  list: PluginListResponse,
  status: PluginStatusResponse,
  watchCode: NonNullable<
    PluginRuntimeResponse["featureCapabilities"]
  >["watchCode"],
): Awaited<ReturnType<typeof openAPI.getPluginsRuntime>> {
  const response = buildRuntimeEndpointResponse(list, status);
  const data = response.data as PluginRuntimeResponse;
  return {
    ...response,
    data: {
      ...data,
      featureCapabilities: {
        watchCode,
      },
    },
  };
}
function buildRuntimeRequestFailure(
  status: number,
): Awaited<ReturnType<typeof openAPI.getPluginsRuntime>> {
  return {
    response: new Response(null, { status }),
  } as Awaited<ReturnType<typeof openAPI.getPluginsRuntime>>;
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function buildActiveAppSubsystemCapabilities(
  pluginId: string,
): NonNullable<PluginRuntimeResponse["featureCapabilities"]>["appSubsystem"] {
  return {
    providerSelection: {
      status: "active",
      selectedPluginId: pluginId,
      activePluginIds: [pluginId],
      disabledPluginIds: [],
      invalidPluginIds: [],
      conflictingPluginIds: [],
    },
    pluginId,
    pluginEnabled: true,
    appAuthoringUi: true,
    appPreviewUi: false,
    appGenerationChatModes: false,
    appDeploymentRuntime: false,
  };
}

function buildUnavailableWatchCodeCapabilities(): NonNullable<
  PluginRuntimeResponse["featureCapabilities"]
>["watchCode"] {
  return {
    providerSelection: {
      status: "no_provider",
      activePluginIds: [],
      disabledPluginIds: [],
      invalidPluginIds: [],
      conflictingPluginIds: [],
    },
    pluginId: "",
    pluginEnabled: false,
    python: false,
    requiresLanguageServer: false,
    canvasControlsUi: false,
  };
}

function buildWatchCodeCapabilities(
  overrides: Partial<
    NonNullable<PluginRuntimeResponse["featureCapabilities"]>["watchCode"]
  >,
): NonNullable<PluginRuntimeResponse["featureCapabilities"]>["watchCode"] {
  return {
    ...buildUnavailableWatchCodeCapabilities(),
    ...overrides,
  };
}

function buildAppSubsystemRegistrationDelta(
  pluginId: string,
  applyStructuredContent: (structured: Record<string, unknown>) => boolean,
  processProjectStateUpdate?: (payload: unknown) => void,
  initializeAppSession?: (
    host: unknown,
    options?: {
      forceNewSession?: boolean;
    },
  ) => Promise<boolean>,
) {
  return {
    appSubsystemRegistrationsByPluginId: {
      [pluginId]: {
        pluginId,
        overviewTab: {
          renderer: { mount: () => undefined },
          titleQuickInfo: `${pluginId} overview`,
          moreMenuQuickInfo: `${pluginId} quick info`,
          moreMenuLabel: pluginId,
        },
        controller: {
          applyAppDefinitionStructuredContentToStore: applyStructuredContent,
          initializeAppSessionFromCurrentDeployment: initializeAppSession,
          processAppProjectStateUpdateFromBackend: processProjectStateUpdate,
        },
      },
    },
    sectionKinds: {},
    panes: {},
    commands: {},
    topNavBarItems: {},
    canvasControls: {},
  };
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
  await expect(host.fetchBackendRoute("watch-code/inputs")).rejects.toMatchObject(
    {
      code: PluginFrontendErrorCodeEnum.RegistrationInvalid,
    },
  );
  await expect(host.fetchBackendRoute("/../admin")).rejects.toMatchObject({
    code: PluginFrontendErrorCodeEnum.RegistrationInvalid,
  });
  await expect(host.fetchBackendRoute("/%2e%2e/admin")).rejects.toMatchObject({
    code: PluginFrontendErrorCodeEnum.RegistrationInvalid,
  });
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

function expectPluginFrontendErrorCode(
  invoke: () => void,
  expectedCode: string,
): void {
  try {
    invoke();
    throw new Error("Expected plugin host call to throw.");
  } catch (error) {
    expect(
      (
        error as {
          code?: string;
        }
      ).code,
    ).toBe(expectedCode);
  }
}
function seedRuntimeSectionState(sectionId: string): void {
  const implId = "impl-dict-runtime";
  const variantId = "variant-dict-runtime";
  useProjectState.setState((state) => {
    state.projectConfig.id = "project-config-initial";
    state.projectConfig.sectionVariantMap = {
      ...state.projectConfig.sectionVariantMap,
      [sectionId]: variantId,
    };
    state.sections[sectionId] = createCore({ id: sectionId });
    state.sectionImpls[implId] = createDictSectionImpl({
      id: implId,
      name: "Runtime Dict Section",
    });
    state.sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
    });
  });
}
function seedRuntimePluginSectionState(sectionId: string): void {
  const implId = "impl-plugin-runtime";
  const variantId = "variant-plugin-runtime";
  useProjectState.setState((state) => {
    state.projectConfig.id = "project-config-plugin-initial";
    state.projectConfig.sectionVariantMap = {
      ...state.projectConfig.sectionVariantMap,
      [sectionId]: variantId,
    };
    state.sections[sectionId] = createCore({ id: sectionId });
    state.sectionImpls[implId] = {
      type: "Plugin",
      id: implId,
      name: "Runtime Plugin Section",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      tagColor: null,
      styleColor: null,
      size: {
        width: 300,
        height: 200,
      },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      pluginId: "acme.plugin",
      kind: "fixture-card",
      data: {
        text: "initial",
      },
      schemaVersion: null,
    };
    state.sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
    });
  });
}
class RuntimeTestWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: RuntimeTestWebSocket[] = [];
  readonly url: string;
  readyState = RuntimeTestWebSocket.CONNECTING;
  sentMessages: string[] = [];
  constructor(url: string | URL) {
    super();
    this.url = String(url);
    RuntimeTestWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sentMessages.push(data);
  }
  close(code?: number, reason?: string): void {
    this.readyState = RuntimeTestWebSocket.CLOSED;
    this.dispatchEvent(
      new CloseEvent("close", {
        code: code ?? 1000,
        reason: reason ?? "",
      }),
    );
  }
  open(): void {
    this.readyState = RuntimeTestWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }
  receiveJson(payload: unknown): void {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify(payload),
      }),
    );
  }
  static reset(): void {
    RuntimeTestWebSocket.instances = [];
  }
}
function buildPluginRuntimeProjectStateUpdate(
  activeIds: string[],
): ProjectStateBackendUpdate {
  const state = useProjectState.getState();
  return createProjectStateBackendUpdate({
    projectState: {
      projectConfig: {
        ...state.projectConfig,
        activeIds: [...activeIds],
      },
      sections: {
        ...state.sections,
      },
      sectionImpls: {
        ...state.sectionImpls,
      },
      sectionVariants: {
        ...state.sectionVariants,
      },
      codeObjs: {
        ...state.codeObjs,
      },
      codeObjImpls: {
        ...state.codeObjImpls,
      },
      codeObjVariants: {
        ...state.codeObjVariants,
      },
      artifactGroups: {
        ...state.artifactGroups,
      },
      singletonSections: {
        ...state.singletonSections,
      },
      parentSectionMap: {
        ...state.parentSectionMap,
      },
      shownParamIds: {
        ...state.shownParamIds,
      },
      projectChatWindowing: createProjectChatWindowingState({
        ...state.projectChatWindowing,
        instancesById: {
          ...state.projectChatWindowing.instancesById,
        },
        order: [...state.projectChatWindowing.order],
      }),
      requiredDecodedImages: [...state.requiredDecodedImages],
      genCodeBinding: state.genCodeBinding,
    },
  });
}
function buildPluginRuntimeProjectState(
  projectConfigId: string,
  activeIds: string[],
  sectionIds: string[],
  pluginData: Record<string, unknown> = {},
) {
  const uniqueSectionIds = [...new Set([...sectionIds, ...activeIds])];
  const sectionVariantMap: Record<string, string> = {};
  const sections: Record<string, ReturnType<typeof createCore>> = {};
  const sectionImpls: Record<
    string,
    ReturnType<typeof createDictSectionImpl>
  > = {};
  const sectionVariants: Record<string, ReturnType<typeof createVariant>> = {};
  for (const sectionId of uniqueSectionIds) {
    const implId = `impl-${sectionId}`;
    const variantId = `variant-${sectionId}`;
    sectionVariantMap[sectionId] = variantId;
    sections[sectionId] = createCore({ id: sectionId });
    sectionImpls[implId] = createDictSectionImpl({
      id: implId,
      name: `Section ${sectionId}`,
    });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
    });
  }
  return {
    projectConfig: createProjectConfig({
      id: projectConfigId,
      activeIds,
      sectionVariantMap,
    }),
    projectChatWindowing: createProjectChatWindowingState(),
    sections,
    sectionImpls,
    sectionVariants,
    codeObjs: {},
    codeObjImpls: {},
    codeObjVariants: {},
    artifactGroups: {},
    pluginData,
    singletonSections: createSingletonSections(),
    parentSectionMap: {},
    shownParamIds: {},
    requiredDecodedImages: [],
    genCodeBinding: null,
  };
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
