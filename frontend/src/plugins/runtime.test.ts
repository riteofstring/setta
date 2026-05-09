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
  invokePluginSettingRevealHandler,
  receivePluginRuntimeUpdate,
  refreshPluginRuntime,
  usePluginRuntimeStore,
  usePluginSectionKind,
  usePluginSectionKinds,
  type RegisteredPluginSectionKind,
} from "plugins/runtime";
import * as runtimeInternal from "plugins/runtimeInternal";
import {
  clearPluginRuntimeSideEffects,
  indexSectionKindKeysByPluginId,
  loadPluginFrontendModule,
} from "plugins/runtimeInternal";
import {
  computePluginSectionFallbackReason,
  PluginFrontendErrorCodeEnum,
  toPluginSectionKindKey,
} from "plugins/runtimeShared";
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
  it("registers canvas controls when capability is effective", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  host.registerCanvasControl({ id: 'utility', label: 'Utility', placement: 'utility', order: 1, renderer: { mount() {} } });\n" +
          "  host.registerCanvasControl({ id: 'watch-code', label: 'Watch Code', placement: 'project', order: 20, renderer: { mount(el, props) { el.dataset.controlId = props.controlId; } } });\n" +
          "  host.registerCanvasControl({ id: 'project-first', label: 'Project First', placement: 'project', order: 10, renderer: { mount() {} } });\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerCanvasControl"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error).toBeNull();
    const control = result?.registryDelta?.canvasControls["acme.plugin"]?.[0];
    expect(
      result?.registryDelta?.canvasControls["acme.plugin"]?.map(
        (entry) => entry.id,
      ),
    ).toEqual(["project-first", "watch-code", "utility"]);
    expect(control?.id).toBe("project-first");
    expect(control?.label).toBe("Project First");
    expect(control?.placement).toBe("project");
    expect(control?.order).toBe(10);
  });
  it("suppresses pending-restart Watch Code provider frontend side effects", async () => {
    const pluginId = "setta-watch-code";
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  globalThis.__settaWatchCodeRegisterCalls = (globalThis.__settaWatchCodeRegisterCalls ?? 0) + 1;\n" +
          "  host.registerCanvasControl({ id: 'watch-code', label: 'Watch Code', placement: 'project', renderer: { mount() {} } });\n" +
          "  host.registerSettingRevealHandler('watch-code-settings', () => true);\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      pluginId,
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: [
        "registerCanvasControl",
        "registerSettingRevealHandler",
      ],
    });
    const status = buildPluginStatusEntry({
      pluginId,
      state: PluginRuntimeStateEnum.pending_restart,
      effectiveCapabilities: plugin.effectiveCapabilities,
    });
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () =>
      buildRuntimeEndpointResponseWithWatchCode(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([status]),
        buildWatchCodeCapabilities({
          providerSelection: {
            status: "pending_restart",
            selectedPluginId: null,
            activePluginIds: [],
            pendingRestartPluginIds: [pluginId],
            disabledPluginIds: [],
            invalidPluginIds: [],
            conflictingPluginIds: [],
          },
          pluginId: "",
          pluginEnabled: false,
        }),
      ),
    );

    await refreshPluginRuntime();

    const state = usePluginRuntimeStore.getState();
    expect(state.canvasControlsByPluginId[pluginId]).toBeUndefined();
    expect(state.sortedCanvasControls).toHaveLength(0);
    expect(
      (globalThis as { __settaWatchCodeRegisterCalls?: number })
        .__settaWatchCodeRegisterCalls,
    ).toBeUndefined();
    await expect(
      invokePluginSettingRevealHandler({
        pluginId,
        revealKey: "watch-code-settings",
        settingId: `plugin::${pluginId}::enabled`,
        paneId: null,
        durationMs: 1000,
        abortSignal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: false,
      message: `Plugin ${pluginId} has no setting reveal handlers.`,
    });
  });
  it("suppresses conflicting Watch Code provider frontend controls and keeps the selected provider active", async () => {
    const registerModuleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  host.registerCanvasControl({ id: 'watch-code', label: 'Watch Code', placement: 'project', renderer: { mount() {} } });\n" +
          "  host.registerSettingRevealHandler('watch-code-settings', () => true);\n" +
          "}\n",
      );
    const capabilities = [
      "registerCanvasControl",
      "registerSettingRevealHandler",
    ];
    const firstPlugin = buildPluginListEntry({
      pluginId: "setta-watch-code-a",
      frontend: {
        entrypointUrl: registerModuleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: capabilities,
    });
    const secondPlugin = buildPluginListEntry({
      pluginId: "setta-watch-code-b",
      frontend: {
        entrypointUrl: registerModuleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: capabilities,
    });
    const firstStatus = buildPluginStatusEntry({
      pluginId: firstPlugin.pluginId,
      effectiveCapabilities: capabilities,
    });
    const secondStatus = buildPluginStatusEntry({
      pluginId: secondPlugin.pluginId,
      effectiveCapabilities: capabilities,
    });
    vi.spyOn(openAPI, "getPluginsRuntime").mockImplementation(async () =>
      buildRuntimeEndpointResponseWithWatchCode(
        buildPluginListResponse([firstPlugin, secondPlugin]),
        buildPluginStatusResponse([firstStatus, secondStatus]),
        buildWatchCodeCapabilities({
          providerSelection: {
            status: "provider_conflict",
            selectedPluginId: null,
            activePluginIds: [firstPlugin.pluginId, secondPlugin.pluginId],
            pendingRestartPluginIds: [],
            disabledPluginIds: [],
            invalidPluginIds: [],
            conflictingPluginIds: [firstPlugin.pluginId, secondPlugin.pluginId],
          },
          pluginId: "",
          pluginEnabled: false,
        }),
      ),
    );

    await refreshPluginRuntime();

    expect(usePluginRuntimeStore.getState().sortedCanvasControls).toHaveLength(
      0,
    );

    vi.mocked(openAPI.getPluginsRuntime).mockImplementation(async () =>
      buildRuntimeEndpointResponseWithWatchCode(
        buildPluginListResponse([firstPlugin, secondPlugin]),
        buildPluginStatusResponse([
          firstStatus,
          buildPluginStatusEntry({
            pluginId: secondPlugin.pluginId,
            state: PluginRuntimeStateEnum.disabled,
            effectiveCapabilities: [],
          }),
        ]),
        buildWatchCodeCapabilities({
          providerSelection: {
            status: "active",
            selectedPluginId: firstPlugin.pluginId,
            activePluginIds: [firstPlugin.pluginId],
            pendingRestartPluginIds: [],
            disabledPluginIds: [secondPlugin.pluginId],
            invalidPluginIds: [],
            conflictingPluginIds: [],
          },
          pluginId: firstPlugin.pluginId,
          pluginEnabled: true,
          python: true,
          canvasControlsUi: true,
        }),
      ),
    );

    await refreshPluginRuntime();

    const controls = usePluginRuntimeStore.getState().sortedCanvasControls;
    expect(controls).toHaveLength(1);
    expect(controls[0]?.pluginId).toBe(firstPlugin.pluginId);
    expect(controls[0]?.id).toBe("watch-code");
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
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
  });
  it("rejects canvas control registration when capability is not effective", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(host) {\n  host.registerCanvasControl({ id: 'watch-code', label: 'Watch Code', renderer: { mount() {} } });\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: [],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
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
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
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
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });
  it("rejects invalid canvas control registrations", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\nexport function register(host) {\n  host.registerCanvasControl({ id: 'bad-placement', label: 'Bad', placement: 'header', renderer: { mount() {} } });\n}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerCanvasControl"],
    });
    const result = await loadPluginFrontendModule(plugin, "ide");
    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
    );
  });
  it("reports runtime error and clears stale runtime-derived plugin state", async () => {
    usePluginRuntimeStore.setState({
      pluginListById: {
        "stale.plugin": buildPluginListEntry({
          pluginId: "stale.plugin",
        }),
      },
      pluginStatusById: {
        "stale.plugin": buildPluginStatusEntry({
          pluginId: "stale.plugin",
        }),
      },
      sectionKindsByKey: {
        [toPluginSectionKindKey("stale.plugin", "stale-kind")]: {
          pluginId: "stale.plugin",
          kind: "stale-kind",
          title: "Stale Kind",
          renderer: {
            mount: () => undefined,
          },
        },
      },
      panesByPluginId: {
        "stale.plugin": [
          {
            pluginId: "stale.plugin",
            id: "stale-pane",
            title: "Stale Pane",
            renderer: {
              mount: () => undefined,
            },
          },
        ],
      },
      canvasControlsByPluginId: {
        "stale.plugin": [
          {
            pluginId: "stale.plugin",
            id: "stale-control",
            label: "Stale Control",
            placement: "project",
            renderer: {
              mount: () => undefined,
            },
          },
        ],
      },
      sortedCanvasControls: [
        {
          pluginId: "stale.plugin",
          id: "stale-control",
          label: "Stale Control",
          placement: "project",
          renderer: {
            mount: () => undefined,
          },
        },
      ],
    });
    vi.spyOn(openAPI, "getPluginsRuntime").mockResolvedValue(
      buildRuntimeRequestFailure(500),
    );
    await refreshPluginRuntime();
    const state = usePluginRuntimeStore.getState();
    expect(state.status).toBe("error");
    expect(state.statusMessage).toBe(
      "Failed to fetch plugins runtime: status 500.",
    );
    expect(Object.keys(state.pluginListById)).toHaveLength(0);
    expect(Object.keys(state.pluginStatusById)).toHaveLength(0);
    expect(Object.keys(state.sectionKindsByKey)).toHaveLength(0);
    expect(Object.keys(state.panesByPluginId)).toHaveLength(0);
    expect(Object.keys(state.canvasControlsByPluginId)).toHaveLength(0);
    expect(state.sortedCanvasControls).toHaveLength(0);
  });
  it("reports runtime error when plugins runtime request fails without response", async () => {
    vi.spyOn(openAPI, "getPluginsRuntime").mockRejectedValue(
      new Error("network error"),
    );
    await refreshPluginRuntime();
    const state = usePluginRuntimeStore.getState();
    expect(state.status).toBe("error");
    expect(state.statusMessage).toBe(
      "Failed to fetch plugins runtime: network error.",
    );
  });
  it("hydrates plugin runtime state from backend websocket updates", async () => {
    const plugin = buildPluginListEntry({
      pluginId: "setta-basedpyright",
      name: "Setta Basedpyright",
      effectiveCapabilities: ["registerLanguageServer"],
    });
    const statusEntry = buildPluginStatusEntry({
      pluginId: "setta-basedpyright",
      name: "Setta Basedpyright",
      effectiveCapabilities: ["registerLanguageServer"],
    });

    await receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([statusEntry], {
          languageServerSelections: [
            {
              language: "python",
              selectionState: "selected",
              status: "active",
              severity: "info",
              message: '"setta-basedpyright" is active for Python.',
              selectedPluginId: "setta-basedpyright",
              appliedPluginId: "setta-basedpyright",
              availableProviders: [
                {
                  pluginId: "setta-basedpyright",
                  name: "Setta Basedpyright (setta-basedpyright)",
                  available: true,
                },
              ],
              restartRequired: false,
            },
          ],
        }),
        {
          featureCapabilities: {
            appSubsystem: {
              providerSelection: {
                status: "active",
                selectedPluginId: "setta-json-render-app-gen",
                activePluginIds: ["setta-json-render-app-gen"],
                disabledPluginIds: [],
                invalidPluginIds: [],
                conflictingPluginIds: [],
              },
              pluginId: "setta-json-render-app-gen",
              pluginEnabled: true,
              appAuthoringUi: true,
              appPreviewUi: true,
              appGenerationChatModes: false,
              appDeploymentRuntime: false,
            },
            watchCode: buildUnavailableWatchCodeCapabilities(),
          },
        },
      ),
    );

    const state = usePluginRuntimeStore.getState();
    expect(state.status).toBe("loaded");
    expect(state.pluginStatusById["setta-basedpyright"]?.state).toBe(
      PluginRuntimeStateEnum.active,
    );
    expect(state.languageServerSelectionsByLanguage.python?.status).toBe(
      "active",
    );
    expect(
      state.languageServerSelectionsByLanguage.python?.appliedPluginId,
    ).toBe("setta-basedpyright");
    expect(state.appSubsystemCapabilities).toMatchObject({
      pluginId: "setta-json-render-app-gen",
      pluginEnabled: true,
      appAuthoringUi: true,
      appPreviewUi: true,
      appGenerationChatModes: false,
      appDeploymentRuntime: false,
      providerSelection: {
        status: "active",
        selectedPluginId: "setta-json-render-app-gen",
        activePluginIds: ["setta-json-render-app-gen"],
        disabledPluginIds: [],
        invalidPluginIds: [],
        conflictingPluginIds: [],
      },
    });
    expect(state.watchCodeCapabilities).toMatchObject({
      pluginId: "",
      pluginEnabled: false,
      python: false,
      providerSelection: {
        status: "no_provider",
        activePluginIds: [],
        disabledPluginIds: [],
        invalidPluginIds: [],
        conflictingPluginIds: [],
      },
    });
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
