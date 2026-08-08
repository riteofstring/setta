import * as openAPI from "openapi/http";
import { loadPluginFrontendModule } from "plugins/runtimeInternal";
import { useProjectState } from "state/definitions";
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
import { expect } from "vitest";

export function buildPluginStatusEntry(
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

export function buildPluginListEntry(
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

export function withPluginConfigDigests(
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

export function withStatusPayloadDigest(
  statusEntry: PluginStatusEntry,
  digest: string,
): PluginStatusEntry {
  return {
    ...statusEntry,
    runtimePayloadDigestSha256: digest,
  } as PluginStatusEntry;
}

export function buildPluginListResponse(
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

export function buildPluginStatusResponse(
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

export function buildPluginRuntimeResponse(
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

export function buildRuntimeEndpointResponse(
  list: PluginListResponse,
  status: PluginStatusResponse,
): Awaited<ReturnType<typeof openAPI.getPluginsRuntime>> {
  return {
    data: buildPluginRuntimeResponse(list, status),
    response: new Response(null, { status: 200 }),
  };
}

export function buildRuntimeEndpointResponseWithWatchCode(
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

export function buildRuntimeRequestFailure(
  status: number,
): Awaited<ReturnType<typeof openAPI.getPluginsRuntime>> {
  return {
    response: new Response(null, { status }),
  } as Awaited<ReturnType<typeof openAPI.getPluginsRuntime>>;
}

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

export function buildActiveAppSubsystemCapabilities(
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

export function buildUnavailableWatchCodeCapabilities(): NonNullable<
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

export function buildWatchCodeCapabilities(
  overrides: Partial<
    NonNullable<PluginRuntimeResponse["featureCapabilities"]>["watchCode"]
  >,
): NonNullable<PluginRuntimeResponse["featureCapabilities"]>["watchCode"] {
  return {
    ...buildUnavailableWatchCodeCapabilities(),
    ...overrides,
  };
}

export function buildAppSubsystemRegistrationDelta(
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

export async function loadPluginRevealHandlerFixture(
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

export function expectPluginFrontendErrorCode(
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

export function seedRuntimeSectionState(sectionId: string): void {
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

export function seedRuntimePluginSectionState(sectionId: string): void {
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

export class RuntimeTestWebSocket extends EventTarget {
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

export function buildPluginRuntimeProjectStateUpdate(
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

export function buildPluginRuntimeProjectState(
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
