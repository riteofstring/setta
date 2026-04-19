/**
 * @vitest-environment jsdom
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
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
        appGenerationChatModes: true,
        appDeploymentRuntime: true,
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

  it("loads the built plugin bundle through runtime metadata", async () => {
    const modulePath = resolve(
      process.cwd(),
      "../plugins/setta-json-render-app-gen/frontend/dist/index.js",
    );
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(readFileSync(modulePath, "utf8"));

    await receivePluginRuntimeUpdate(
      buildPluginRuntimeResponse(
        buildPluginListResponse([
          buildPluginListEntryWithDefaults({
            pluginId: "setta-json-render-app-gen",
            name: "Setta JSON Render App Generation",
            frontend: {
              entrypointUrl: moduleUrl,
              styleUrl: null,
            },
          }),
        ]),
        buildPluginStatusResponse([
          buildPluginStatusEntryWithDefaults({
            pluginId: "setta-json-render-app-gen",
            name: "Setta JSON Render App Generation",
          }),
        ]),
      ),
    );

    expect(
      usePluginRuntimeStore.getState().frontendErrorsByPluginId[
        "setta-json-render-app-gen"
      ],
    ).toBeUndefined();
    expect(
      getAppSubsystemFrontendRuntimeState().registration?.overviewTab,
    ).toMatchObject({
      moreMenuLabel: "JSON Render",
    });
    expect(
      getAppSubsystemFrontendRuntimeState().registration?.chat?.slashCommands
        .length,
    ).toBeGreaterThan(0);
    expect(
      getAppSubsystemFrontendRuntimeState().registration?.appDeploymentModal,
    ).not.toBeNull();
  });
});
