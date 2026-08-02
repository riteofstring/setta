import {
  AppSubsystemChatUIConfig,
  getActiveAppSubsystemFrontendHostRuntime,
} from "@setta/app-subsystem-frontend-sdk";
import { syncStoreInitialState } from "components/Panes/paneTestUtils";
import {
  type AppSubsystemFrontendRegistrationsByPluginId,
  appSubsystemModeRequiresImageAttachment,
  applyAppDefinitionStructuredContentToStore,
  beginAppSubsystemFrontendRegistrationLoad,
  buildDefaultAppSpecPath,
  createAppSubsystemFrontendHost,
  getAppSubsystemDeploymentRuntimeUnavailableMessage,
  getAppSubsystemFrontendRuntimeState,
  initializeAppSessionFromCurrentDeployment,
  isAppSubsystemFrontendRegistration,
  processAppProjectStateUpdateFromBackend,
  resetAppSubsystemFrontendRuntimeState,
  runAppSubsystemProjectResetHooks,
  syncAppSubsystemFrontendRegistration,
  useAppSubsystemAppDeploymentModal,
  useAppSubsystemCustomSlashCommandModeOptions,
  useAppSubsystemDefaultCustomSlashCommandMode,
  useAppSubsystemFrontendStore,
  useAppSubsystemOverviewTab,
  useAppSubsystemSlashCommands,
  useAppSubsystemSupportedAppGenerationModes,
} from "plugins/appSubsystem";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resetProjectStateMock = vi.fn();
const applyStructuredContentMock = vi.fn();
const initializeAppSessionMock = vi.fn();
let mockPreviewEnabled = false;
let previewEnabledListener: ((previewEnabled: boolean) => void) | null = null;
const NOOP_APP_SUBSYSTEM_RENDERER = { mount: () => undefined };

function testSlashCommandForMode(appGenerationMode: string) {
  const command = AppSubsystemChatUIConfig.slashCommands.find(
    (entry) => entry.appGenerationMode === appGenerationMode,
  );
  if (!command) {
    throw new Error(`Missing test slash command for ${appGenerationMode}.`);
  }
  return { ...command };
}

function testCustomSlashCommandModeOption(mode: string) {
  const option = AppSubsystemChatUIConfig.customSlashCommandModeOptions.find(
    (entry) => entry.value === mode,
  );
  if (!option) {
    throw new Error(`Missing test custom slash-command mode for ${mode}.`);
  }
  return {
    id: option.value,
    name: option.label,
  };
}

const MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION = {
  overviewTab: {
    renderer: NOOP_APP_SUBSYSTEM_RENDERER,
    titleQuickInfo: "Authoring quick info",
    moreMenuQuickInfo: "More menu quick info",
    moreMenuLabel: "JSON Render",
  },
  previewSurface: {
    renderer: NOOP_APP_SUBSYSTEM_RENDERER,
  },
  appModeRoute: {
    renderer: NOOP_APP_SUBSYSTEM_RENDERER,
  },
  appDeploymentModal: {
    renderer: NOOP_APP_SUBSYSTEM_RENDERER,
  },
  chat: {
    slashCommands: AppSubsystemChatUIConfig.slashCommands.map((entry) => ({
      ...entry,
    })),
    imageRequiredModes: AppSubsystemChatUIConfig.customSlashCommandModeOptions
      .filter((entry) => entry.requiresImageAttachment)
      .map((entry) => entry.value),
    customSlashCommandModes: {
      options: AppSubsystemChatUIConfig.customSlashCommandModeOptions.map(
        (entry) => ({
          id: entry.value,
          name: entry.label,
        }),
      ),
      defaultMode: "plain_chat",
    },
  },
  controller: {
    getPreviewEnabled: () => mockPreviewEnabled,
    subscribePreviewEnabled: (listener: (previewEnabled: boolean) => void) => {
      previewEnabledListener = listener;
      return () => {
        if (previewEnabledListener === listener) {
          previewEnabledListener = null;
        }
      };
    },
    applyAppDefinitionStructuredContentToStore: applyStructuredContentMock,
    initializeAppSessionFromCurrentDeployment: initializeAppSessionMock,
    resetProjectState: () => {
      resetProjectStateMock();
    },
  },
};

const OTHER_APP_SUBSYSTEM_CAPABILITIES = {
  pluginId: "acme-alt-provider",
  pluginEnabled: true,
  appAuthoringUi: true,
  appPreviewUi: true,
  appGenerationChatModes: true,
  appDeploymentRuntime: true,
} as const;

const OTHER_APP_SUBSYSTEM_FRONTEND_REGISTRATION = {
  ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION,
  chat: {
    slashCommands: [testSlashCommandForMode("json_render_with_image")],
    imageRequiredModes: ["json_render_with_image"],
    customSlashCommandModes: {
      options: [
        testCustomSlashCommandModeOption("plain_chat"),
        testCustomSlashCommandModeOption("json_render_with_image"),
      ],
      defaultMode: "json_render_with_image",
    },
  },
};

const ENABLED_APP_SUBSYSTEM_CAPABILITIES = {
  pluginId: "setta-json-render-app-gen",
  pluginEnabled: true,
  appAuthoringUi: true,
  appPreviewUi: true,
  appGenerationChatModes: true,
  appDeploymentRuntime: true,
} as const;
const MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATIONS: AppSubsystemFrontendRegistrationsByPluginId =
  {
    [ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId]: {
      ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION,
      pluginId: ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId,
    },
    [OTHER_APP_SUBSYSTEM_CAPABILITIES.pluginId]: {
      ...OTHER_APP_SUBSYSTEM_FRONTEND_REGISTRATION,
      pluginId: OTHER_APP_SUBSYSTEM_CAPABILITIES.pluginId,
    },
  };

async function syncEnabledAppSubsystem(): Promise<void> {
  await syncAppSubsystemFrontendRegistration(
    ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATIONS,
  );
}

async function syncOtherAppSubsystem(): Promise<void> {
  await syncAppSubsystemFrontendRegistration(
    OTHER_APP_SUBSYSTEM_CAPABILITIES,
    MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATIONS,
  );
}

async function expectAppGenerationChatRegistrationRejected(
  chat: typeof MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION.chat,
  statusMessage: string,
): Promise<void> {
  await syncAppSubsystemFrontendRegistration(
    ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    {
      [ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId]: {
        ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION,
        pluginId: ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId,
        chat,
      },
    },
  );

  expect(getAppSubsystemFrontendRuntimeState()).toMatchObject({
    status: "error",
    statusMessage,
    registration: null,
  });
  syncStoreInitialState(useAppSubsystemFrontendStore);
  expect(renderToStaticMarkup(<AppSubsystemSlashCommandProbe />)).toBe(
    "<span></span>",
  );
}

function AppSubsystemOverviewProbe() {
  const overviewTab = useAppSubsystemOverviewTab();
  return <span>{overviewTab?.moreMenuLabel ?? "missing"}</span>;
}

function AppSubsystemSlashCommandProbe() {
  const slashCommands = useAppSubsystemSlashCommands();
  return <span>{slashCommands.map((entry) => entry.command).join(",")}</span>;
}

function AppSubsystemAppDeploymentModalProbe() {
  const appDeploymentModal = useAppSubsystemAppDeploymentModal();
  return <span>{appDeploymentModal ? "available" : "missing"}</span>;
}

function AppSubsystemCustomSlashModeProbe() {
  const options = useAppSubsystemCustomSlashCommandModeOptions();
  const defaultMode = useAppSubsystemDefaultCustomSlashCommandMode();
  return (
    <span>
      {defaultMode}:
      {options.map((entry) => `${entry.id}=${entry.name}`).join(",")}
    </span>
  );
}

function AppSubsystemSupportedModesProbe() {
  const modes = useAppSubsystemSupportedAppGenerationModes();
  return <span>{modes.join(",")}</span>;
}

describe("appSubsystem", () => {
  beforeEach(() => {
    resetProjectStateMock.mockReset();
    applyStructuredContentMock.mockReset();
    applyStructuredContentMock.mockReturnValue(true);
    initializeAppSessionMock.mockReset();
    initializeAppSessionMock.mockResolvedValue(true);
    mockPreviewEnabled = false;
    previewEnabledListener = null;
    resetAppSubsystemFrontendRuntimeState();
  });

  afterEach(() => {
    resetProjectStateMock.mockReset();
    applyStructuredContentMock.mockReset();
    initializeAppSessionMock.mockReset();
    mockPreviewEnabled = false;
    previewEnabledListener = null;
    resetAppSubsystemFrontendRuntimeState();
  });

  it("rejects legacy component-based registrations", () => {
    expect(
      isAppSubsystemFrontendRegistration({
        overviewTab: {
          component: () => null,
          titleQuickInfo: "Quick info",
          moreMenuQuickInfo: "More quick info",
          moreMenuLabel: "Legacy",
        },
      }),
    ).toBe(false);
  });

  it("treats missing capabilities as unavailable and does not keep stale registrations", async () => {
    await syncEnabledAppSubsystem();
    expect(getAppSubsystemFrontendRuntimeState().status).toBe("loaded");

    await syncAppSubsystemFrontendRegistration(null, {});

    expect(getAppSubsystemFrontendRuntimeState()).toMatchObject({
      capabilities: null,
      status: "unavailable",
      registration: null,
    });
  });

  it("queues project-state updates until app-subsystem registration finishes loading", async () => {
    const processAppProjectStateUpdateFromBackendMock = vi.fn();
    beginAppSubsystemFrontendRegistrationLoad(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    );

    const payload = {
      projectState: {
        projectConfig: {
          id: "project-1",
        },
      },
    } as Parameters<typeof processAppProjectStateUpdateFromBackend>[0];

    processAppProjectStateUpdateFromBackend(payload);

    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
      {
        [ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId]: {
          ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION,
          pluginId: ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId,
          controller: {
            ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION.controller,
            processAppProjectStateUpdateFromBackend:
              processAppProjectStateUpdateFromBackendMock,
          },
        },
      },
    );

    expect(processAppProjectStateUpdateFromBackendMock).toHaveBeenCalledTimes(
      1,
    );
    expect(processAppProjectStateUpdateFromBackendMock).toHaveBeenCalledWith(
      payload,
    );
  });

  it("treats invalid-provider capabilities as unavailable instead of erroring", async () => {
    await syncAppSubsystemFrontendRegistration(
      {
        pluginId: "",
        pluginEnabled: false,
        appAuthoringUi: false,
        appPreviewUi: false,
        appGenerationChatModes: false,
        appDeploymentRuntime: false,
        providerSelection: {
          status: "invalid_provider",
          activePluginIds: [],
          disabledPluginIds: [],
          invalidPluginIds: ["acme.invalid-provider"],
          conflictingPluginIds: [],
        },
      },
      {},
    );

    expect(getAppSubsystemFrontendRuntimeState()).toMatchObject({
      status: "unavailable",
      statusMessage: null,
      registration: null,
    });
  });

  it("loads the lazy app subsystem frontend registration when frontend surfaces are enabled", async () => {
    await syncEnabledAppSubsystem();
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(getAppSubsystemFrontendRuntimeState()).toMatchObject({
      capabilities: ENABLED_APP_SUBSYSTEM_CAPABILITIES,
      status: "loaded",
      statusMessage: null,
    });
    expect(getAppSubsystemFrontendRuntimeState().registration).not.toBeNull();
  });

  it("requires deployment-runtime providers to register an app initializer", async () => {
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
      {
        [ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId]: {
          ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION,
          pluginId: ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId,
          controller: {
            ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION.controller,
            initializeAppSessionFromCurrentDeployment: undefined,
          },
        },
      },
    );

    expect(getAppSubsystemFrontendRuntimeState()).toMatchObject({
      status: "error",
      statusMessage:
        "App subsystem frontend adapter is missing the app deployment initialization controller.",
      registration: null,
    });
  });

  it("rejects app-generation chat registrations with missing prompt templates", async () => {
    await expectAppGenerationChatRegistrationRejected(
      {
        ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION.chat,
        slashCommands: [
          {
            ...testSlashCommandForMode("json_render"),
            promptTemplate: "",
          },
        ],
      },
      "App subsystem frontend adapter slash command /app-json is missing promptTemplate.",
    );
  });

  it("rejects app-generation chat registrations with unsupported modes", async () => {
    await expectAppGenerationChatRegistrationRejected(
      {
        ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION.chat,
        slashCommands: [
          {
            ...testSlashCommandForMode("json_render"),
            appGenerationMode: "acme_app",
          },
        ],
      },
      'App subsystem frontend adapter slash command /app-json declares unsupported appGenerationMode "acme_app".',
    );
  });

  it("rejects app-generation image-required modes outside the Go-owned registry", async () => {
    await expectAppGenerationChatRegistrationRejected(
      {
        ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION.chat,
        imageRequiredModes: ["acme_app"],
      },
      'App subsystem frontend adapter registered unsupported image-required appGenerationMode "acme_app".',
    );
  });

  it("activates the host runtime while initializing app deployments", async () => {
    const frontendHost = createAppSubsystemFrontendHost();
    const activeHostMatches: boolean[] = [];
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
      {
        [ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId]: {
          ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION,
          pluginId: ENABLED_APP_SUBSYSTEM_CAPABILITIES.pluginId,
          controller: {
            ...MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION.controller,
            initializeAppSessionFromCurrentDeployment: async (host) => {
              activeHostMatches.push(
                host === frontendHost &&
                  getActiveAppSubsystemFrontendHostRuntime() === frontendHost,
              );
              return true;
            },
          },
        },
      },
    );

    await expect(
      initializeAppSessionFromCurrentDeployment(frontendHost),
    ).resolves.toBe(true);
    expect(activeHostMatches).toEqual([true]);
    expect(getActiveAppSubsystemFrontendHostRuntime()).toBeNull();
  });

  it("routes project reset hooks through the loaded registration", async () => {
    await syncEnabledAppSubsystem();
    syncStoreInitialState(useAppSubsystemFrontendStore);

    runAppSubsystemProjectResetHooks();

    expect(resetProjectStateMock).toHaveBeenCalledTimes(1);
  });

  it("exposes preview-enabled state through the runtime hook", () => {
    mockPreviewEnabled = true;
    useAppSubsystemFrontendStore.setState({ previewEnabled: true });

    expect(getAppSubsystemFrontendRuntimeState().previewEnabled).toBe(true);
  });

  it("exposes the loaded authoring registration through hooks", async () => {
    await syncEnabledAppSubsystem();
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(renderToStaticMarkup(<AppSubsystemOverviewProbe />)).toContain(
      "JSON Render",
    );
  });

  it("exposes app slash commands through capability-gated hooks", async () => {
    await syncEnabledAppSubsystem();
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(renderToStaticMarkup(<AppSubsystemSlashCommandProbe />)).toContain(
      "/app-json",
    );
  });

  it("keeps app-generation chat registrations on Go-owned executable modes", async () => {
    await syncEnabledAppSubsystem();
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(renderToStaticMarkup(<AppSubsystemSlashCommandProbe />)).toContain(
      "/app-json",
    );
    expect(
      renderToStaticMarkup(<AppSubsystemCustomSlashModeProbe />),
    ).toContain("plain_chat:plain_chat=Plain chat,json_render=JSON Render");

    await syncOtherAppSubsystem();
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(renderToStaticMarkup(<AppSubsystemSlashCommandProbe />)).toContain(
      "/app-image",
    );
    expect(
      renderToStaticMarkup(<AppSubsystemCustomSlashModeProbe />),
    ).toContain(
      "json_render_with_image:plain_chat=Plain chat,json_render_with_image=Image to JSON Render",
    );
    expect(
      appSubsystemModeRequiresImageAttachment("json_render_with_image"),
    ).toBe(true);
  });

  it("exposes the app deployment modal through capability-gated hooks", async () => {
    await syncEnabledAppSubsystem();
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(
      renderToStaticMarkup(<AppSubsystemAppDeploymentModalProbe />),
    ).toContain("available");
  });

  it("hides app slash commands when the subsystem is unavailable", async () => {
    await syncAppSubsystemFrontendRegistration(null, {});
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(
      renderToStaticMarkup(<AppSubsystemSlashCommandProbe />),
    ).not.toContain("/app-json");
  });

  it("exposes image-required mode metadata only when the subsystem is available", async () => {
    expect(
      appSubsystemModeRequiresImageAttachment("json_render_with_image"),
    ).toBe(false);

    await syncEnabledAppSubsystem();

    expect(
      appSubsystemModeRequiresImageAttachment("json_render_with_image"),
    ).toBe(true);
    expect(appSubsystemModeRequiresImageAttachment("json_render")).toBe(false);
  });

  it("exposes supported app-generation modes through a capability-gated hook", async () => {
    await syncEnabledAppSubsystem();
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(renderToStaticMarkup(<AppSubsystemSupportedModesProbe />)).toContain(
      "json_render",
    );
  });

  it("falls back to plain-chat-only custom slash modes when the subsystem is unavailable", async () => {
    await syncAppSubsystemFrontendRegistration(null, {});
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(
      renderToStaticMarkup(<AppSubsystemCustomSlashModeProbe />),
    ).toContain("plain_chat:plain_chat=Plain chat");
  });

  it("exposes plugin-owned custom slash modes through capability-gated hooks", async () => {
    await syncEnabledAppSubsystem();
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(
      renderToStaticMarkup(<AppSubsystemCustomSlashModeProbe />),
    ).toContain("plain_chat:plain_chat=Plain chat,json_render=JSON Render");
  });

  it("builds a provider-scoped default app spec path", () => {
    const providerPluginId = "acme.third-party-app-provider";
    expect(buildDefaultAppSpecPath(providerPluginId)).toBe(
      `plugins/${providerPluginId}/app_specs/app.json`,
    );
  });

  it("routes structured app-definition updates through the runtime adapter", async () => {
    await syncEnabledAppSubsystem();
    const applied = applyAppDefinitionStructuredContentToStore({
      appDefinition: { id: "app-1" },
      appSpec: { title: "Runtime adapter" },
    });

    expect(applied).toBe(true);
    expect(applyStructuredContentMock).toHaveBeenCalledWith({
      appDefinition: { id: "app-1" },
      appSpec: { title: "Runtime adapter" },
    });
  });

  it("updates preview-enabled runtime state from the loaded registration subscription", async () => {
    await syncEnabledAppSubsystem();
    expect(getAppSubsystemFrontendRuntimeState().previewEnabled).toBe(false);

    mockPreviewEnabled = true;
    previewEnabledListener?.(true);

    expect(getAppSubsystemFrontendRuntimeState().previewEnabled).toBe(true);
  });

  it("fails loudly when the active provider does not register frontend surfaces", async () => {
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
      {},
    );

    expect(getAppSubsystemFrontendRuntimeState()).toMatchObject({
      capabilities: ENABLED_APP_SUBSYSTEM_CAPABILITIES,
      status: "error",
      statusMessage:
        "App subsystem provider setta-json-render-app-gen did not register frontend surfaces through the plugin host.",
      registration: null,
    });
  });

  it("formats app-mode unavailability from provider conflicts", () => {
    expect(
      getAppSubsystemDeploymentRuntimeUnavailableMessage({
        pluginId: "",
        pluginEnabled: false,
        appAuthoringUi: false,
        appPreviewUi: false,
        appGenerationChatModes: false,
        appDeploymentRuntime: false,
        providerSelection: {
          status: "provider_conflict",
          activePluginIds: ["acme.app-provider-b", "acme.app-provider-a"],
          disabledPluginIds: [],
          invalidPluginIds: [],
          conflictingPluginIds: ["acme.app-provider-b", "acme.app-provider-a"],
        },
      }),
    ).toBe(
      'App mode is unavailable because multiple app subsystem providers are active: "acme.app-provider-a", "acme.app-provider-b". Disable all but one.',
    );
  });

  it("formats app-mode unavailability when the selected provider lacks deployment runtime support", () => {
    expect(
      getAppSubsystemDeploymentRuntimeUnavailableMessage({
        pluginId: "acme.active-app-provider",
        pluginEnabled: true,
        appAuthoringUi: true,
        appPreviewUi: true,
        appGenerationChatModes: true,
        appDeploymentRuntime: false,
        providerSelection: {
          status: "active",
          selectedPluginId: "acme.active-app-provider",
          activePluginIds: ["acme.active-app-provider"],
          disabledPluginIds: [],
          invalidPluginIds: [],
          conflictingPluginIds: [],
        },
      }),
    ).toBe(
      'App mode is unavailable because app subsystem provider "acme.active-app-provider" does not declare app deployment runtime support.',
    );
  });
});
