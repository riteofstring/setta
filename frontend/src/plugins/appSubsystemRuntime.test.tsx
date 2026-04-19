import { syncStoreInitialState } from "components/Panes/paneTestUtils";
import {
  appSubsystemModeRequiresImageAttachment,
  getAppSubsystemFrontendRuntimeState,
  resetAppSubsystemFrontendRuntimeState,
  runAppSubsystemProjectResetHooks,
  syncAppSubsystemFrontendRegistration,
  useAppSubsystemAppDeploymentModal,
  useAppSubsystemCustomSlashCommandModeOptions,
  useAppSubsystemDefaultCustomSlashCommandMode,
  useAppSubsystemFrontendStore,
  useAppSubsystemOverviewTab,
  useAppSubsystemSlashCommands,
} from "plugins/appSubsystemRuntime";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resetProjectStateMock = vi.fn();

const MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION = {
  overviewTab: {
    component: () => null,
    titleQuickInfo: "Authoring quick info",
    moreMenuQuickInfo: "More menu quick info",
    moreMenuLabel: "JSON Render",
  },
  previewSurface: {
    component: () => null,
  },
  appModeRoute: {
    component: () => null,
  },
  appDeploymentModal: {
    component: () => null,
  },
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
  resetProjectState: () => {
    resetProjectStateMock();
  },
};

vi.mock("plugins/appSubsystemHostAdapter", () => ({
  default: MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION,
  appSubsystemFrontendRegistration: MOCK_APP_SUBSYSTEM_FRONTEND_REGISTRATION,
}));

const ENABLED_APP_SUBSYSTEM_CAPABILITIES = {
  pluginId: "setta-json-render-app-gen",
  pluginEnabled: true,
  appAuthoringUi: true,
  appPreviewUi: true,
  appGenerationChatModes: true,
  appDeploymentRuntime: true,
} as const;

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

describe("appSubsystemRuntime", () => {
  beforeEach(() => {
    resetProjectStateMock.mockReset();
    resetAppSubsystemFrontendRuntimeState();
  });

  afterEach(() => {
    resetProjectStateMock.mockReset();
    resetAppSubsystemFrontendRuntimeState();
  });

  it("treats missing capabilities as unavailable and does not keep stale registrations", async () => {
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    );
    expect(getAppSubsystemFrontendRuntimeState().status).toBe("loaded");

    await syncAppSubsystemFrontendRegistration(null);

    expect(getAppSubsystemFrontendRuntimeState()).toMatchObject({
      capabilities: null,
      status: "unavailable",
      registration: null,
    });
  });

  it("loads the lazy app subsystem frontend registration when frontend surfaces are enabled", async () => {
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    );
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(getAppSubsystemFrontendRuntimeState()).toMatchObject({
      capabilities: ENABLED_APP_SUBSYSTEM_CAPABILITIES,
      status: "loaded",
      statusMessage: null,
    });
    expect(getAppSubsystemFrontendRuntimeState().registration).not.toBeNull();
  });

  it("routes project reset hooks through the loaded registration", async () => {
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    );
    syncStoreInitialState(useAppSubsystemFrontendStore);

    runAppSubsystemProjectResetHooks();

    expect(resetProjectStateMock).toHaveBeenCalledTimes(1);
  });

  it("exposes the loaded authoring registration through hooks", async () => {
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    );
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(renderToStaticMarkup(<AppSubsystemOverviewProbe />)).toContain(
      "JSON Render",
    );
  });

  it("exposes app slash commands through capability-gated hooks", async () => {
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    );
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(renderToStaticMarkup(<AppSubsystemSlashCommandProbe />)).toContain(
      "/app-json",
    );
  });

  it("exposes the app deployment modal through capability-gated hooks", async () => {
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    );
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(
      renderToStaticMarkup(<AppSubsystemAppDeploymentModalProbe />),
    ).toContain("available");
  });

  it("hides app slash commands when the subsystem is unavailable", async () => {
    await syncAppSubsystemFrontendRegistration(null);
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(
      renderToStaticMarkup(<AppSubsystemSlashCommandProbe />),
    ).not.toContain("/app-json");
  });

  it("exposes image-required mode metadata only when the subsystem is available", async () => {
    expect(
      appSubsystemModeRequiresImageAttachment("json_render_with_image"),
    ).toBe(false);

    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    );

    expect(
      appSubsystemModeRequiresImageAttachment("json_render_with_image"),
    ).toBe(true);
    expect(appSubsystemModeRequiresImageAttachment("json_render")).toBe(false);
  });

  it("falls back to plain-chat-only custom slash modes when the subsystem is unavailable", async () => {
    await syncAppSubsystemFrontendRegistration(null);
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(
      renderToStaticMarkup(<AppSubsystemCustomSlashModeProbe />),
    ).toContain("plain_chat:plain_chat=Plain chat");
  });

  it("exposes plugin-owned custom slash modes through capability-gated hooks", async () => {
    await syncAppSubsystemFrontendRegistration(
      ENABLED_APP_SUBSYSTEM_CAPABILITIES,
    );
    syncStoreInitialState(useAppSubsystemFrontendStore);

    expect(
      renderToStaticMarkup(<AppSubsystemCustomSlashModeProbe />),
    ).toContain("plain_chat:plain_chat=Plain chat,json_render=JSON Render");
  });
});
