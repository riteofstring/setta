import { syncStoreInitialState } from "components/Panes/paneTestUtils";
import {
  type AppSubsystemFrontendRegistrationsByPluginId,
  appSubsystemModeRequiresImageAttachment,
  applyAppDefinitionStructuredContentToStore,
  buildDefaultAppSpecPath,
  getAppSubsystemDeploymentRuntimeUnavailableMessage,
  getAppSubsystemFrontendRuntimeState,
  isAppSubsystemFrontendRegistration,
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
let mockPreviewEnabled = false;
let previewEnabledListener: ((previewEnabled: boolean) => void) | null = null;
const NOOP_APP_SUBSYSTEM_RENDERER = { mount: () => undefined };

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
    slashCommands: [
      {
        command: "/app-json",
        action: "app_json_render",
        summary: "Generate an app spec.",
        promptTemplate: "Generate an app spec.",
        appGenerationMode: "json_render",
      },
    ],
    imageRequiredModes: ["json_render_with_image"],
    customSlashCommandModes: {
      options: [
        { id: "plain_chat", name: "Plain chat" },
        { id: "json_render", name: "JSON Render" },
      ],
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
    slashCommands: [
      {
        command: "/acme-app",
        action: "acme_app_render",
        summary: "Generate the alternate provider app spec.",
        promptTemplate: "Generate an alternate provider app spec.",
        appGenerationMode: "acme_render",
      },
    ],
    imageRequiredModes: ["acme_render"],
    customSlashCommandModes: {
      options: [
        { id: "plain_chat", name: "Plain chat" },
        { id: "acme_render", name: "Acme Render" },
      ],
      defaultMode: "acme_render",
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
    mockPreviewEnabled = false;
    previewEnabledListener = null;
    resetAppSubsystemFrontendRuntimeState();
  });

  afterEach(() => {
    resetProjectStateMock.mockReset();
    applyStructuredContentMock.mockReset();
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

  it("switches slash commands and default mode with the selected provider", async () => {
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
      "/acme-app",
    );
    expect(
      renderToStaticMarkup(<AppSubsystemCustomSlashModeProbe />),
    ).toContain("acme_render:plain_chat=Plain chat,acme_render=Acme Render");
    expect(appSubsystemModeRequiresImageAttachment("acme_render")).toBe(true);
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
