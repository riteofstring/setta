import { syncStoreInitialState } from "components/Panes/paneTestUtils";
import * as generatedEndpoints from "openapi/http";
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
import { setActiveSectionIds } from "state/actions/activeSections";
import * as realtimeDependencySend from "state/actions/realtimeDependencySend";
import { processProjectStateUpdateFromBackend } from "state/actions/sectionInfos";
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
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  PluginRuntimeStateEnum,
  SectionTypeEnum,
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
