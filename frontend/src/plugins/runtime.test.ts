import { syncStoreInitialState } from "components/Panes/paneTestUtils";
import {
  computePluginSectionFallbackReason,
  getPluginSectionFallbackReason,
  invokePluginSettingRevealHandler,
  PluginFrontendErrorCodeEnum,
  pluginRuntimeTestApi,
  PluginSectionFallbackReasonEnum,
  refreshPluginRuntime,
  resetPluginRuntimeStoreForTests,
  toPluginSectionKindKey,
  usePluginCommands,
  usePluginListEntries,
  usePluginPaneTabs,
  usePluginRuntimeStore,
  usePluginSectionKind,
  usePluginSectionKinds,
  usePluginStatusEntries,
  usePluginTopNavBarItems,
  type RegisteredPluginSectionKind,
} from "plugins/runtime";
import React from "react";
import { renderToString } from "react-dom/server";
import * as websocketReceive from "state/actions/websocketReceive";
import { useProjectState, useShareSession } from "state/definitions";
import { C_ADDRESSES } from "utils/c_addresses";
import * as generatedEndpoints from "utils/generatedEndpoints";
import {
  createCore,
  createDictSectionImpl,
  createPluginListEntry,
  createPluginStatusEntry,
  createUserDefaultDictSectionImpl,
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
    sourcePath: "/tmp/acme.plugin",
    canonicalSourceKey: "github:acme/plugin",
    sourceDigestSha256: null,
    shadowedBySourcePath: null,
    requestedCapabilities: [],
    effectiveCapabilities: [],
    blockedCapabilities: [],
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
      schemaJson: null,
    },
    effectiveCapabilities: [],
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
    plugins,
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
): Awaited<ReturnType<typeof generatedEndpoints.route_plugins_runtime>> {
  return {
    data: buildPluginRuntimeResponse(list, status),
    status: 200,
    hasResponse: true,
  };
}

type CapturedPluginHost = {
  createStore: <TState extends object>(
    initializer: StateCreator<TState, [], []>,
  ) => StoreApi<TState>;
  registerContextMenu: (definition: Record<string, unknown>) => void;
  getProjectContext: () => { projectConfigId: string; serverMode: string };
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

function getCapturedPluginHost(): CapturedPluginHost {
  const globalScope = globalThis as {
    __settaCapturedPluginHost?: CapturedPluginHost;
  };
  if (!globalScope.__settaCapturedPluginHost) {
    throw new Error("Plugin test module did not capture host object.");
  }
  return globalScope.__settaCapturedPluginHost;
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
    state.sectionImpls[implId] = createDictSectionImpl(
      createUserDefaultDictSectionImpl(),
      {
        id: implId,
        name: "Runtime Dict Section",
      },
    );
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

describe("plugin runtime helpers", () => {
  beforeEach(() => {
    resetPluginRuntimeStoreForTests();
    vi.restoreAllMocks();
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockResolvedValue({
      data: undefined,
      status: undefined,
      hasResponse: false,
    });
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-before-each";
      state.projectConfig.activeIds = [];
      state.projectConfig.sectionVariantMap = {};
      state.sections = {};
      state.sectionImpls = {};
      state.sectionVariants = {};
      state.previewSectionVariantMap = {};
    });
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
    });
  });

  afterEach(() => {
    resetPluginRuntimeStoreForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const globalScope = globalThis as {
      __settaCapturedPluginHost?: CapturedPluginHost;
      __settaCleanupProbe?: {
        callCount: number;
      };
    };
    delete globalScope.__settaCapturedPluginHost;
    delete globalScope.__settaCleanupProbe;
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-after-each";
      state.projectConfig.activeIds = [];
      state.projectConfig.sectionVariantMap = {};
      state.sections = {};
      state.sectionImpls = {};
      state.sectionVariants = {};
      state.previewSectionVariantMap = {};
    });
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
    });
  });

  it("builds deterministic section-kind keys", () => {
    expect(toPluginSectionKindKey("acme.tools", "widget")).toBe(
      "acme.tools::widget",
    );
  });

  it("returns plugin_not_installed when status entry is missing", () => {
    expect(getPluginSectionFallbackReason("missing.plugin", "kind")).toBe(
      PluginSectionFallbackReasonEnum.plugin_not_installed,
    );
  });

  it("computes fallback reason from explicit runtime state snapshots", () => {
    const snapshot = usePluginRuntimeStore.getState();
    expect(
      computePluginSectionFallbackReason(snapshot, "missing.plugin", "kind"),
    ).toBe(PluginSectionFallbackReasonEnum.plugin_not_installed);
  });

  it("returns plugin_disabled when plugin status is disabled", () => {
    usePluginRuntimeStore.setState({
      pluginStatusById: {
        "acme.plugin": buildPluginStatusEntry({
          state: PluginRuntimeStateEnum.disabled,
        }),
      },
    });
    expect(getPluginSectionFallbackReason("acme.plugin", "kind")).toBe(
      PluginSectionFallbackReasonEnum.plugin_disabled,
    );
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
    expect(getPluginSectionFallbackReason("acme.plugin", "kind")).toBe(
      PluginSectionFallbackReasonEnum.mode_blocked,
    );
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
    expect(getPluginSectionFallbackReason("acme.plugin", "kind")).toBe(
      PluginSectionFallbackReasonEnum.frontend_load_failed,
    );
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

    expect(
      pluginRuntimeTestApi.indexSectionKindKeysByPluginId(sectionKindsByKey),
    ).toEqual({
      "alpha.plugin": [
        toPluginSectionKindKey("alpha.plugin", "one"),
        toPluginSectionKindKey("alpha.plugin", "two"),
      ],
      "beta.plugin": [toPluginSectionKindKey("beta.plugin", "main")],
    });
  });

  it("clones project-state snapshots only when mutation isolation requires it", () => {
    const primitiveSnapshot =
      pluginRuntimeTestApi.cloneProjectStateSnapshot(42);
    expect(primitiveSnapshot).toBe(42);

    const scalarArray = ["a", "b", "c"];
    const clonedScalarArray =
      pluginRuntimeTestApi.cloneProjectStateSnapshot(scalarArray);
    expect(clonedScalarArray).toEqual(["a", "b", "c"]);
    expect(clonedScalarArray).not.toBe(scalarArray);

    const objectSnapshot = {
      nested: {
        value: "x",
      },
    };
    const clonedObjectSnapshot = pluginRuntimeTestApi.cloneProjectStateSnapshot(
      objectSnapshot,
    ) as {
      nested: {
        value: string;
      };
    };
    expect(clonedObjectSnapshot).toEqual(objectSnapshot);
    expect(clonedObjectSnapshot).not.toBe(objectSnapshot);
    expect(clonedObjectSnapshot.nested).not.toBe(objectSnapshot.nested);
  });

  it("reuses section snapshot entries when section identities are unchanged", () => {
    const sectionIds = ["section-a", "section-b", "section-c"];
    const rawA = {
      value: "a",
    };
    const rawB = {
      value: "b",
    };
    const rawC = {
      value: "c",
    };
    const firstSnapshot = pluginRuntimeTestApi.toProjectStateSectionSnapshot(
      sectionIds,
      [rawA, rawB, rawC],
    );

    const updatedRawB = {
      value: "b-updated",
    };
    const secondSnapshot = pluginRuntimeTestApi.toProjectStateSectionSnapshot(
      sectionIds,
      [rawA, updatedRawB, rawC],
      [rawA, rawB, rawC],
      firstSnapshot,
    );

    expect(secondSnapshot["section-a"]).toBe(firstSnapshot["section-a"]);
    expect(secondSnapshot["section-c"]).toBe(firstSnapshot["section-c"]);
    expect(secondSnapshot["section-b"]).not.toBe(firstSnapshot["section-b"]);
    expect(secondSnapshot["section-b"]).toEqual({
      value: "b-updated",
    });
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error).toBeNull();
    expect(result?.registryDelta?.topNavBarItems["acme.plugin"]?.[0]?.id).toBe(
      "quick-action",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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
    });
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockResolvedValue({
      data: undefined,
      status: 500,
      hasResponse: true,
    });

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
  });

  it("reports runtime error when plugins runtime request fails without response", async () => {
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockResolvedValue({
      data: undefined,
      status: undefined,
      hasResponse: false,
    });

    await refreshPluginRuntime();

    const state = usePluginRuntimeStore.getState();
    expect(state.status).toBe("error");
    expect(state.statusMessage).toBe(
      "Failed to fetch plugins runtime: network error.",
    );
  });

  it("removes plugin styles when refresh enters error state", async () => {
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
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: "/plugins/acme.plugin/frontend/dist/index.css?v=1",
      },
    });
    const loadResult = await pluginRuntimeTestApi.loadPluginFrontendModule(
      pluginWithStyle,
      "ide",
    );
    expect(loadResult?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(1);

    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockResolvedValue({
      data: undefined,
      status: 500,
      hasResponse: true,
    });

    await refreshPluginRuntime();

    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(0);
  });

  it("prefers non-shadowed status entries as the primary plugin status", async () => {
    const plugin = buildPluginListEntry({});
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockResolvedValue(
      buildRuntimeEndpointResponse(
        buildPluginListResponse([plugin]),
        buildPluginStatusResponse([
          buildPluginStatusEntry({
            pluginId: "acme.plugin",
            sourcePath: "/tmp/shadowed",
            shadowedBySourcePath: "/tmp/primary",
          }),
          buildPluginStatusEntry({
            pluginId: "acme.plugin",
            sourcePath: "/tmp/primary",
            shadowedBySourcePath: null,
          }),
        ]),
      ),
    );

    await refreshPluginRuntime();

    const state = usePluginRuntimeStore.getState();
    expect(state.pluginStatusById["acme.plugin"]?.sourcePath).toBe(
      "/tmp/primary",
    );
  });

  it("reuses unchanged plugin frontend registrations across refreshes", async () => {
    const globalScope = globalThis as {
      __settaIncrementalRegisterCalls?: number;
    };
    delete globalScope.__settaIncrementalRegisterCalls;

    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(_host) {\n" +
          "  globalThis.__settaIncrementalRegisterCalls = Number(globalThis.__settaIncrementalRegisterCalls || 0) + 1;\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      sourceDigestSha256: "digest-1",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
    });
    const status = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
    });

    let listPayload = buildPluginListResponse([plugin]);
    let statusPayload = buildPluginStatusResponse([status]);
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => ({
        data: buildPluginRuntimeResponse(listPayload, statusPayload),
        status: 200,
        hasResponse: true,
      }),
    );

    await refreshPluginRuntime();
    await refreshPluginRuntime();

    expect(globalScope.__settaIncrementalRegisterCalls).toBe(1);
    expect(usePluginRuntimeStore.getState().status).toBe("loaded");
  });

  it("does not reload plugin frontend when effective capability order changes", async () => {
    const globalScope = globalThis as {
      __settaCapabilityOrderRegisterCalls?: number;
    };
    delete globalScope.__settaCapabilityOrderRegisterCalls;

    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(_host) {\n" +
          "  globalThis.__settaCapabilityOrderRegisterCalls = Number(globalThis.__settaCapabilityOrderRegisterCalls || 0) + 1;\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      pluginId: "acme.capability-order",
      sourceDigestSha256: "digest-capability-order",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: ["registerPane", "registerCommand"],
    });
    let effectiveCapabilities = ["registerPane", "registerCommand"];
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => ({
        data: buildPluginRuntimeResponse(
          buildPluginListResponse([plugin]),
          buildPluginStatusResponse([
            buildPluginStatusEntry({
              pluginId: plugin.pluginId,
              requestedCapabilities: [...effectiveCapabilities],
              effectiveCapabilities: [...effectiveCapabilities],
              blockedCapabilities: [],
            }),
          ]),
        ),
        status: 200,
        hasResponse: true,
      }),
    );

    await refreshPluginRuntime();
    effectiveCapabilities = ["registerCommand", "registerPane"];
    await refreshPluginRuntime();

    expect(globalScope.__settaCapabilityOrderRegisterCalls).toBe(1);
  });

  it("recovers plugin registrations after transient runtime errors with unchanged signatures", async () => {
    const globalScope = globalThis as {
      __settaRecoveryRegisterCalls?: number;
    };
    delete globalScope.__settaRecoveryRegisterCalls;

    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  globalThis.__settaRecoveryRegisterCalls = Number(globalThis.__settaRecoveryRegisterCalls || 0) + 1;\n" +
          "  host.registerPane({ id: 'recovery-pane', title: 'Recovery Pane', renderer: { mount() {} } });\n" +
          "}\n",
      );
    const runtimeCapabilities = ["registerPane"];
    const plugin = buildPluginListEntry({
      pluginId: "acme.runtime-recovery",
      sourceDigestSha256: "digest-recovery",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: runtimeCapabilities,
    });
    const status = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
      requestedCapabilities: runtimeCapabilities,
      effectiveCapabilities: runtimeCapabilities,
      blockedCapabilities: [],
    });
    let runtimeCalls = 0;

    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => {
        runtimeCalls += 1;
        if (runtimeCalls === 2) {
          return {
            data: undefined,
            status: 500,
            hasResponse: true,
          };
        }
        return {
          data: buildPluginRuntimeResponse(
            buildPluginListResponse([plugin]),
            buildPluginStatusResponse([status]),
          ),
          status: 200,
          hasResponse: true,
        };
      },
    );

    await refreshPluginRuntime();
    expect(globalScope.__settaRecoveryRegisterCalls).toBe(1);
    expect(
      usePluginRuntimeStore.getState().panesByPluginId[plugin.pluginId]?.[0]
        ?.id,
    ).toBe("recovery-pane");

    await refreshPluginRuntime();
    expect(usePluginRuntimeStore.getState().status).toBe("error");

    await refreshPluginRuntime();
    const recoveredState = usePluginRuntimeStore.getState();
    expect(recoveredState.status).toBe("loaded");
    expect(globalScope.__settaRecoveryRegisterCalls).toBe(2);
    expect(recoveredState.panesByPluginId[plugin.pluginId]?.[0]?.id).toBe(
      "recovery-pane",
    );
  });

  it("reuses sorted registry views across no-op runtime refreshes", async () => {
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  host.registerSectionKind({ kind: 'fixture-kind', title: 'Fixture Kind', renderer: { mount() {} } });\n" +
          "  host.registerPane({ id: 'fixture-pane', title: 'Fixture Pane', renderer: { mount() {} } });\n" +
          "  host.registerCommand({ id: 'fixture-command', title: 'Fixture Command', run() {} });\n" +
          "  host.registerTopNavBarItem({ id: 'fixture-nav', label: 'Fixture Nav', onClick() {} });\n" +
          "}\n",
      );
    const runtimeCapabilities = [
      "registerSectionKinds",
      "registerPane",
      "registerCommand",
      "registerTopNavBarItem",
    ];
    const plugin = buildPluginListEntry({
      pluginId: "acme.runtime-perf",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
      effectiveCapabilities: runtimeCapabilities,
    });
    const status = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
      requestedCapabilities: runtimeCapabilities,
      effectiveCapabilities: runtimeCapabilities,
      blockedCapabilities: [],
    });
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => ({
        data: buildPluginRuntimeResponse(
          buildPluginListResponse([plugin]),
          buildPluginStatusResponse([status]),
        ),
        status: 200,
        hasResponse: true,
      }),
    );

    await refreshPluginRuntime();
    const firstState = usePluginRuntimeStore.getState();
    const firstSortedPluginListEntries = firstState.sortedPluginListEntries;
    const firstSortedSectionKinds = firstState.sortedSectionKinds;
    const firstSortedPaneTabs = firstState.sortedPaneTabs;
    const firstSortedCommands = firstState.sortedCommands;
    const firstSortedTopNavBarItems = firstState.sortedTopNavBarItems;

    await refreshPluginRuntime();
    const secondState = usePluginRuntimeStore.getState();
    expect(secondState.sortedPluginListEntries).toBe(
      firstSortedPluginListEntries,
    );
    expect(secondState.sortedSectionKinds).toBe(firstSortedSectionKinds);
    expect(secondState.sortedPaneTabs).toBe(firstSortedPaneTabs);
    expect(secondState.sortedCommands).toBe(firstSortedCommands);
    expect(secondState.sortedTopNavBarItems).toBe(firstSortedTopNavBarItems);
  });

  it("reuses plugin status entry references across no-op runtime refreshes", async () => {
    const plugin = buildPluginListEntry({
      pluginId: "acme.status-reuse",
      frontend: {
        entrypointUrl: null,
        styleUrl: null,
      },
    });
    const status = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
      requestedCapabilities: ["registerPane"],
      effectiveCapabilities: ["registerPane"],
    });
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => ({
        data: buildPluginRuntimeResponse(
          buildPluginListResponse([plugin]),
          buildPluginStatusResponse([
            {
              ...status,
              requestedCapabilities: [...status.requestedCapabilities],
              effectiveCapabilities: [...status.effectiveCapabilities],
              blockedCapabilities: [...status.blockedCapabilities],
              registeredLanguageServers: [...status.registeredLanguageServers],
              registeredExternalAgentAdapters: [
                ...status.registeredExternalAgentAdapters,
              ],
              registeredCodegenTargets: [...status.registeredCodegenTargets],
              errors: [...status.errors],
            },
          ]),
        ),
        status: 200,
        hasResponse: true,
      }),
    );

    await refreshPluginRuntime();
    const firstState = usePluginRuntimeStore.getState();
    const firstPrimaryStatus = firstState.pluginStatusById[plugin.pluginId];
    const firstStatusEntries = firstState.statusEntries;
    const firstStatusEntry = firstStatusEntries[0];

    await refreshPluginRuntime();
    const secondState = usePluginRuntimeStore.getState();
    expect(secondState.statusEntries).toBe(firstStatusEntries);
    expect(secondState.statusEntries[0]).toBe(firstStatusEntry);
    expect(secondState.pluginStatusById[plugin.pluginId]).toBe(
      firstPrimaryStatus,
    );
  });

  it("replaces plugin status entry references when runtime payload digest changes", async () => {
    const plugin = buildPluginListEntry({
      pluginId: "acme.status-digest-change",
      frontend: {
        entrypointUrl: null,
        styleUrl: null,
      },
    });
    const baseStatus = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
      requestedCapabilities: ["registerPane"],
      effectiveCapabilities: ["registerPane"],
      blockedCapabilities: [],
    });
    const firstStatus = withStatusPayloadDigest(baseStatus, "digest-a");
    const secondStatus = withStatusPayloadDigest(
      {
        ...baseStatus,
        requestedCapabilities: [...baseStatus.requestedCapabilities],
        effectiveCapabilities: [...baseStatus.effectiveCapabilities],
      },
      "digest-b",
    );
    let runtimeCallCount = 0;
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => {
        runtimeCallCount += 1;
        if (runtimeCallCount === 1) {
          return buildRuntimeEndpointResponse(
            buildPluginListResponse([plugin]),
            buildPluginStatusResponse([firstStatus]),
          );
        }
        return buildRuntimeEndpointResponse(
          buildPluginListResponse([plugin]),
          buildPluginStatusResponse([secondStatus]),
        );
      },
    );

    await refreshPluginRuntime();
    const firstState = usePluginRuntimeStore.getState();
    const firstStatusEntry = firstState.statusEntries[0];

    await refreshPluginRuntime();
    const secondState = usePluginRuntimeStore.getState();
    const secondStatusEntry = secondState.statusEntries[0];
    expect(secondStatusEntry).not.toBe(firstStatusEntry);
  });

  it("reuses empty status entries across no-op runtime refreshes", async () => {
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockResolvedValue(
      buildRuntimeEndpointResponse(
        buildPluginListResponse([]),
        buildPluginStatusResponse([]),
      ),
    );

    await refreshPluginRuntime();
    const firstState = usePluginRuntimeStore.getState();
    const firstStatusEntries = firstState.statusEntries;

    await refreshPluginRuntime();
    const secondState = usePluginRuntimeStore.getState();
    expect(secondState.statusEntries).toBe(firstStatusEntries);
  });

  it("reloads plugin frontend when refresh signature changes", async () => {
    const globalScope = globalThis as {
      __settaIncrementalRegisterCalls?: number;
    };
    delete globalScope.__settaIncrementalRegisterCalls;

    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(_host) {\n" +
          "  globalThis.__settaIncrementalRegisterCalls = Number(globalThis.__settaIncrementalRegisterCalls || 0) + 1;\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      sourceDigestSha256: "digest-a",
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
    });
    const status = buildPluginStatusEntry({
      pluginId: plugin.pluginId,
    });
    let digest = "digest-a";

    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => ({
        data: buildPluginRuntimeResponse(
          buildPluginListResponse([
            buildPluginListEntry({
              ...plugin,
              sourceDigestSha256: digest,
            }),
          ]),
          buildPluginStatusResponse([status]),
        ),
        status: 200,
        hasResponse: true,
      }),
    );

    await refreshPluginRuntime();
    digest = "digest-b";
    await refreshPluginRuntime();

    expect(globalScope.__settaIncrementalRegisterCalls).toBe(2);
  });

  it("queues one follow-up refresh when calls overlap", async () => {
    let releaseRequests: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseRequests = resolve;
    });
    let runtimeCalls = 0;

    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => {
        runtimeCalls += 1;
        await gate;
        return {
          data: buildPluginRuntimeResponse(
            buildPluginListResponse([]),
            buildPluginStatusResponse([]),
          ),
          status: 200,
          hasResponse: true,
        };
      },
    );

    const first = refreshPluginRuntime();
    const second = refreshPluginRuntime();
    const third = refreshPluginRuntime();
    await Promise.resolve();
    expect(runtimeCalls).toBe(1);

    if (releaseRequests) {
      releaseRequests();
    }
    await Promise.all([first, second, third]);
    expect(runtimeCalls).toBe(2);
    expect(usePluginRuntimeStore.getState().status).toBe("loaded");
  });

  it("apiFetch normalizes plugin paths and attaches deployment share headers", async () => {
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-123",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const moduleUrl =
      "data:text/javascript," +
      encodeURIComponent(
        "export const apiVersion = 1;\n" +
          "export function register(host) {\n" +
          "  void host.apiFetch('health');\n" +
          "  void host.apiFetch('/status', { headers: { 'X-Custom': 'yes' } });\n" +
          "}\n",
      );
    const plugin = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "share",
    );

    expect(result?.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/plugins/acme.plugin/health`,
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      `${C_ADDRESSES.BACKEND}/plugins/acme.plugin/status`,
    );
    const firstHeaders = new Headers(
      (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers,
    );
    const secondHeaders = new Headers(
      (fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined)?.headers,
    );
    expect(firstHeaders.get("X-Share-Session-Id")).toBe("share-session-123");
    expect(secondHeaders.get("X-Share-Session-Id")).toBe("share-session-123");
    expect(secondHeaders.get("X-Custom")).toBe("yes");
  });

  it("normalizePluginPath rejects traversal segments for apiFetch", () => {
    expect(() =>
      pluginRuntimeTestApi.normalizePluginPath("/../../api/projects"),
    ).toThrow("apiFetch path cannot include relative traversal segments");
    expect(() => pluginRuntimeTestApi.normalizePluginPath("/a/../b")).toThrow(
      "apiFetch path cannot include relative traversal segments",
    );
    expect(() =>
      pluginRuntimeTestApi.normalizePluginPath("/%2e%2e/api/projects"),
    ).toThrow("apiFetch path cannot include relative traversal segments");
    expect(() =>
      pluginRuntimeTestApi.normalizePluginPath("/%2e%2e%2fapi/projects"),
    ).toThrow("apiFetch path cannot include relative traversal segments");
    expect(() =>
      pluginRuntimeTestApi.normalizePluginPath("/safe/%2E%2E%2Ffoo"),
    ).toThrow("apiFetch path cannot include relative traversal segments");
    expect(pluginRuntimeTestApi.normalizePluginPath("health")).toBe("/health");
    expect(pluginRuntimeTestApi.normalizePluginPath("//status")).toBe(
      "/status",
    );
    expect(pluginRuntimeTestApi.normalizePluginPath("/status?ok=1")).toBe(
      "/status?ok=1",
    );
  });

  it("manages plugin style links across repeated and null-style loads", async () => {
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
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: "/plugins/acme.plugin/frontend/dist/index.css?v=1",
      },
    });

    const firstLoad = await pluginRuntimeTestApi.loadPluginFrontendModule(
      pluginWithStyle,
      "ide",
    );
    expect(firstLoad?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(1);

    const secondLoad = await pluginRuntimeTestApi.loadPluginFrontendModule(
      pluginWithStyle,
      "ide",
    );
    expect(secondLoad?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(1);

    const pluginWithoutStyle = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: null,
      },
    });
    const noStyleLoad = await pluginRuntimeTestApi.loadPluginFrontendModule(
      pluginWithoutStyle,
      "ide",
    );
    expect(noStyleLoad?.error).toBeNull();
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(0);
  });

  it("removes plugin styles when frontend load fails", async () => {
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
        "export const apiVersion = 1;\nexport function register(_host) { throw new Error('boom'); }\n",
      );
    const pluginWithStyle = buildPluginListEntry({
      frontend: {
        entrypointUrl: moduleUrl,
        styleUrl: "/plugins/acme.plugin/frontend/dist/index.css?v=1",
      },
      effectiveCapabilities: ["registerPane"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      pluginWithStyle,
      "ide",
    );

    expect(result?.error?.code).toBe(
      PluginFrontendErrorCodeEnum.FrontendLoadFailed,
    );
    expect(fakeLinks.filter((link) => !link.removed)).toHaveLength(0);
  });

  it("captures host APIs and enforces unimplemented host capabilities", async () => {
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
    expect(result?.error).toBeNull();

    const host = getCapturedPluginHost();
    expectPluginFrontendErrorCode(
      () => host.registerContextMenu({ id: "ctx-menu" }),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
    expectPluginFrontendErrorCode(
      () => host.openArtifact("artifact-1"),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
    await expect(
      host.createArtifact({ kind: "artifact" }),
    ).rejects.toMatchObject({
      code: PluginFrontendErrorCodeEnum.CapabilityDenied,
    });
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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
    useProjectState.setState((state) => {
      state.projectConfig.activeIds = [sectionId];
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
      effectiveCapabilities: ["readProjectState"],
    });

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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
    expect(refreshedProjectConfig.activeIds).toEqual([sectionId]);

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
    useProjectState.setState((state) => {
      state.projectConfig.activeIds = [];
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    useProjectState.setState((state) => {
      state.projectConfig.activeIds = [sectionId];
    });
    useProjectState.setState((state) => {
      state.projectConfig.activeIds = [sectionId, "section-next"];
    });
    unsubscribe();
    useProjectState.setState((state) => {
      state.projectConfig.activeIds = ["section-after-unsubscribe"];
    });

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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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
      .spyOn(websocketReceive, "sendRealtimeDependencyEvent")
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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
      .spyOn(websocketReceive, "sendRealtimeDependencyEvent")
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => ({
        data: buildPluginRuntimeResponse(listPayload, statusPayload),
        status: 200,
        hasResponse: true,
      }),
    );

    await refreshPluginRuntime();
    useProjectState.setState((state) => {
      state.projectConfig.activeIds = ["section-after-first-load"];
    });
    expect(globalScope.__settaCleanupProbe?.callCount).toBe(1);

    listPayload = buildPluginListResponse([]);
    statusPayload = buildPluginStatusResponse([]);
    await refreshPluginRuntime();
    useProjectState.setState((state) => {
      state.projectConfig.activeIds = ["section-after-cleanup"];
    });
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
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockResolvedValue(
      runtimePayload,
    );

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
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => {
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
      },
    );

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
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => {
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
      },
    );

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
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => {
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
      },
    );

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
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => {
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
      },
    );

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
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockResolvedValue(
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
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockResolvedValue(
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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

    const result = await pluginRuntimeTestApi.loadPluginFrontendModule(
      plugin,
      "ide",
    );
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
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockImplementation(
      async () => ({
        data: buildPluginRuntimeResponse(listPayload, statusPayload),
        status: 200,
        hasResponse: true,
      }),
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
    vi.spyOn(generatedEndpoints, "route_plugins_runtime").mockResolvedValue(
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

    await pluginRuntimeTestApi.runWithConcurrencyLimit(
      tasks,
      3,
      async (taskIndex: number) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => {
          setTimeout(resolve, 1);
        });
        completed.push(taskIndex);
        inFlight -= 1;
      },
    );

    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(completed).toHaveLength(tasks.length);
    expect(completed.sort((a, b) => a - b)).toEqual(tasks);
  });

  it("only loads plugin frontends when runtime status is active or pending restart", () => {
    expect(pluginRuntimeTestApi.shouldLoadPluginFrontend(undefined)).toBe(
      false,
    );
    expect(
      pluginRuntimeTestApi.shouldLoadPluginFrontend(
        buildPluginStatusEntry({ state: PluginRuntimeStateEnum.active }),
      ),
    ).toBe(true);
    expect(
      pluginRuntimeTestApi.shouldLoadPluginFrontend(
        buildPluginStatusEntry({
          state: PluginRuntimeStateEnum.pending_restart,
        }),
      ),
    ).toBe(true);
    expect(
      pluginRuntimeTestApi.shouldLoadPluginFrontend(
        buildPluginStatusEntry({ state: PluginRuntimeStateEnum.disabled }),
      ),
    ).toBe(false);
    expect(
      pluginRuntimeTestApi.shouldLoadPluginFrontend(
        buildPluginStatusEntry({ state: PluginRuntimeStateEnum.invalid }),
      ),
    ).toBe(false);
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

    expect(getPluginSectionFallbackReason("acme.plugin", "kind")).toBe(
      PluginSectionFallbackReasonEnum.section_kind_missing,
    );
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

    expect(getPluginSectionFallbackReason("acme.plugin", "kind")).toBeNull();
  });

  it("treats non-boolean plugin reveal handler results as contract failures", async () => {
    const pluginId = "acme.plugin";
    const revealKey = "full-settings";
    pluginRuntimeTestApi.registerPluginSettingRevealHandler(
      pluginId,
      revealKey,
      () => {
        const malformed = JSON.parse('"unexpected-string"');
        return malformed;
      },
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
    pluginRuntimeTestApi.registerPluginSettingRevealHandler(
      pluginId,
      revealKey,
      handlerSpy,
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
    pluginRuntimeTestApi.registerPluginSettingRevealHandler(
      pluginId,
      revealKey,
      ({ abortSignal }) =>
        new Promise<boolean>((resolve) => {
          abortSignal.addEventListener(
            "abort",
            () => {
              resolve(true);
            },
            { once: true },
          );
        }),
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
