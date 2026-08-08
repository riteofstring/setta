import * as openAPI from "openapi/http";
import {
  invokePluginSettingRevealHandler,
  receivePluginRuntimeUpdate,
  refreshPluginRuntime,
  usePluginRuntimeStore,
} from "plugins/runtime";
import { loadPluginFrontendModule } from "plugins/runtimeInternal";
import {
  PluginFrontendErrorCodeEnum,
  toPluginSectionKindKey,
} from "plugins/runtimeShared";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState, useShareSession } from "state/definitions";
import { PluginRuntimeStateEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPluginListEntry,
  buildPluginListResponse,
  buildPluginRuntimeResponse,
  buildPluginStatusEntry,
  buildPluginStatusResponse,
  buildRuntimeEndpointResponseWithWatchCode,
  buildRuntimeRequestFailure,
  buildUnavailableWatchCodeCapabilities,
  buildWatchCodeCapabilities,
  canvasControlsForPlugin,
  type CapturedPluginHost,
  pluginModuleUrl,
  resetPluginRuntimeStateForTests,
  RuntimeTestWebSocket,
} from "./runtime.testHelpers";

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
  it("registers canvas controls when capability is effective", async () => {
    const moduleUrl = pluginModuleUrl(
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
    const controls = canvasControlsForPlugin(result, "acme.plugin");
    const control = controls[0];
    expect(controls.map((entry) => entry.id)).toEqual([
      "project-first",
      "watch-code",
      "utility",
    ]);
    expect(control).toMatchObject({
      id: "project-first",
      label: "Project First",
      placement: "project",
      order: 10,
    });
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
});
