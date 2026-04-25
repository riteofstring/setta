/**
 * @vitest-environment jsdom
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createAppSubsystemFrontendHost,
  getAppSubsystemFrontendRuntimeState,
  resetAppSubsystemFrontendRuntimeState,
} from "plugins/appSubsystem";
import {
  receivePluginRuntimeUpdate,
  usePluginRuntimeStore,
} from "plugins/runtime";
import { clearPluginRuntimeSideEffects } from "plugins/runtimeInternal";
import {
  createPluginListEntry,
  createPluginStatusEntry,
  PluginRuntimeStateEnum,
  type PluginListEntry,
  type PluginListResponse,
  type PluginRestartCapability,
  type PluginRuntimeResponse,
  type PluginStatusEntry,
  type PluginStatusResponse,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function resetPluginRuntimeStateForTests(): void {
  clearPluginRuntimeSideEffects();
  resetAppSubsystemFrontendRuntimeState();
  usePluginRuntimeStore.setState({
    status: "idle",
    statusMessage: null,
    schemaVersion: null,
    serverMode: null,
    appSubsystemCapabilities: null,
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
    frontendErrorsByPluginId: {},
  });
}

function buildPluginListEntryWithDefaults(
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

function buildPluginStatusEntryWithDefaults(
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

function buildPluginListResponse(
  plugins: PluginListEntry[],
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
  };
}

function buildPluginStatusResponse(
  plugins: PluginStatusEntry[],
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
  };
}

function buildPluginRuntimeResponse(
  list: PluginListResponse,
  status: PluginStatusResponse,
  pluginId: string,
): PluginRuntimeResponse {
  return {
    schemaVersion: 1,
    serverMode: "ide",
    list,
    status,
    featureCapabilities: {
      appSubsystem: {
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
        appPreviewUi: true,
        appGenerationChatModes: true,
        appDeploymentRuntime: true,
      },
      watchCode: {
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
      },
    },
  };
}

describe("app subsystem built plugin bundle", () => {
  beforeEach(() => {
    resetPluginRuntimeStateForTests();
  });

  afterEach(() => {
    resetPluginRuntimeStateForTests();
  });

  it("loads an unknown-id app-subsystem fixture through the same runtime metadata contract", async () => {
    const pluginId = "acme-app-subsystem-fixture";
    const modulePath = resolve(
      process.cwd(),
      "../tests/fixtures/plugins/app-subsystem-unknown-id/frontend/src/index.js",
    );
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(readFileSync(modulePath, "utf8"));

    await receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntryWithDefaults({
            pluginId,
            name: "Acme App Subsystem Fixture",
            frontend: {
              entrypointUrl: moduleUrl,
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntryWithDefaults({
            pluginId,
            name: "Acme App Subsystem Fixture",
          }),
        ]),
        pluginId,
      ),
    );

    expect(
      usePluginRuntimeStore.getState().frontendErrorsByPluginId[pluginId],
    ).toBeUndefined();

    const registration = getAppSubsystemFrontendRuntimeState().registration;
    expect(registration?.pluginId).toBe(pluginId);
    expect(registration?.overviewTab).toMatchObject({
      moreMenuLabel: "Acme App",
    });
    expect(registration?.chat?.slashCommands).toEqual([
      expect.objectContaining({
        command: "/app-json",
        appGenerationMode: "json_render",
      }),
    ]);
    expect(registration?.controller?.getPreviewEnabled?.()).toBe(true);

    const host = createAppSubsystemFrontendHost({
      getProjectContext: () => ({
        defaultProjectConfigId: "project-config",
        projectMetadata: [{ id: "project-config", name: "Fixture Project" }],
        projectConfig: {
          id: "project-config",
          name: "Fixture Project",
          entryCodeBlockId: null,
        },
      }),
    });
    const mountTarget = document.createElement("div");
    const modalTarget = document.createElement("div");

    registration?.overviewTab?.renderer.mount(mountTarget, {}, host);
    expect(mountTarget.textContent).toBe("overview-tab:Fixture Project:static");

    registration?.appDeploymentModal?.renderer.mount(
      modalTarget,
      { open: true },
      host,
    );
    expect(modalTarget.textContent).toBe(
      "app-deployment-modal:Fixture Project:open",
    );

    registration?.appDeploymentModal?.renderer.update?.(
      modalTarget,
      { open: false },
      host,
    );
    expect(modalTarget.textContent).toBe(
      "app-deployment-modal:Fixture Project:closed",
    );

    registration?.appDeploymentModal?.renderer.unmount?.(modalTarget);
    expect(modalTarget.textContent).toBe("");
    expect(modalTarget.dataset.acmeAppSubsystemUnmounted).toBe(
      "app-deployment-modal",
    );
  });
});
