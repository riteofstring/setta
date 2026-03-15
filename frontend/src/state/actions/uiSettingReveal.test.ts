import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { resetProjectStores } from "state/utils";
import * as endpoints from "utils/generatedEndpoints";
import type {
  SectionType,
  UISettingRevealContent,
  UISettingRevealTarget,
} from "utils/generatedTypes";
import {
  createCodeSectionImpl,
  createCore,
  createUserDefaultCodeSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSectionIds } from "./activeSections";
import { processProjectStateUpdateFromBackend } from "./sectionProjectStateSync";

const invokePluginSettingRevealHandlerMock = vi.hoisted(() =>
  vi.fn(async (args: { pluginId: string }) => ({
    ok: false,
    message: `Plugin ${args.pluginId} has no setting reveal handlers.`,
  })),
);

vi.mock("plugins/runtime", async () => {
  const actual =
    await vi.importActual<typeof import("plugins/runtime")>("plugins/runtime");
  return {
    ...actual,
    invokePluginSettingRevealHandler: invokePluginSettingRevealHandlerMock,
  };
});

import {
  invokePluginSettingRevealHandler,
  usePluginRuntimeStore,
} from "plugins/runtime";

type PluginRevealInvokeArgs = Parameters<
  typeof invokePluginSettingRevealHandler
>[0];
let receiveUISettingReveal: typeof import("./uiSettingRevealRequests").receiveUISettingReveal;

function createRevealTarget(
  overrides: Partial<UISettingRevealTarget>,
): UISettingRevealTarget {
  return {
    settingId: "core.watch_code.enabled",
    side: "left",
    overviewTabKey: "Overview",
    uiEditorTabName: null,
    pluginId: null,
    paneId: null,
    strategy: "dom_anchor",
    anchorId: "core.watch_code.enabled",
    pluginRevealKey: null,
    revealActivationSteps: [],
    ...overrides,
  };
}

function createRevealContent(
  overrides: Partial<UISettingRevealContent>,
): UISettingRevealContent {
  return {
    projectConfigId: "project-1",
    chatId: null,
    reveals: [createRevealTarget({})],
    durationMs: 120,
    requestId: "request-1",
    ...overrides,
  };
}

function createFakeAnchor(anchorId: string): HTMLElement {
  const classes = new Set<string>();
  const classList: DOMTokenList = {
    add: (...tokens: string[]) => {
      for (const token of tokens) {
        classes.add(token);
      }
    },
    contains: (token: string) => classes.has(token),
    remove: (...tokens: string[]) => {
      for (const token of tokens) {
        classes.delete(token);
      }
    },
    replace: vi.fn(() => false),
    supports: vi.fn(() => false),
    toggle: vi.fn(() => false),
    value: "",
    length: 0,
    item: vi.fn(() => null),
    [Symbol.iterator]: function* () {
      yield* classes.values();
    },
    forEach: vi.fn(),
    entries: vi.fn(),
    keys: vi.fn(),
    values: vi.fn(),
  } as unknown as DOMTokenList;

  return {
    dataset: {
      settingAnchor: anchorId,
    },
    classList,
    scrollIntoView: vi.fn(),
  } as unknown as HTMLElement;
}

function createFakePaneRoot(
  anchor: HTMLElement,
  anchorId = "core.watch_code.enabled",
): HTMLElement {
  return {
    querySelector: vi.fn((selector: string) => {
      if (selector === `[data-setting-anchor="${anchorId}"]`) {
        return anchor;
      }
      return null;
    }),
  } as unknown as HTMLElement;
}

function setActiveSectionType(sectionType: SectionType): void {
  const sectionId = "section-active";
  const variantId = "variant-active";
  const implId = "impl-active";
  useProjectState.setState((state) => {
    state.projectConfig.id = "project-active";
    state.projectConfig.sectionVariantMap = {
      ...state.projectConfig.sectionVariantMap,
      [sectionId]: variantId,
    };
    state.sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      nonPresetImpls: [implId],
      name: "active-variant",
    });
    if (sectionType === SectionTypeEnum.Code) {
      state.sectionImpls[implId] = createCodeSectionImpl(
        createUserDefaultCodeSectionImpl(),
        {
          id: implId,
        },
      );
      return;
    }
    throw new Error(`Unsupported section type in test helper: ${sectionType}`);
  });
  useActiveSectionUI.setState({ activeIds: [sectionId] });
}

function configureCodeSections({
  projectConfigId,
  sectionIds,
  activeIds,
}: {
  projectConfigId: string;
  sectionIds: Array<string>;
  activeIds: Array<string>;
}): void {
  useProjectState.setState((state) => {
    state.projectConfig.id = projectConfigId;
    for (const sectionId of sectionIds) {
      const variantId = `variant-${sectionId}`;
      const implId = `impl-${sectionId}`;
      state.sections[sectionId] = createCore({ id: sectionId });
      state.projectConfig.sectionVariantMap[sectionId] = variantId;
      state.sectionVariants[variantId] = createVariant({
        id: variantId,
        impl: implId,
        nonPresetImpls: [implId],
        name: `variant-${sectionId}`,
      });
      state.sectionImpls[implId] = createCodeSectionImpl(
        createUserDefaultCodeSectionImpl(),
        {
          id: implId,
        },
      );
    }
  });
  useActiveSectionUI.setState({ activeIds: [...activeIds] });
}

function buildBackendProjectStateUpdate({
  projectConfigId,
  activeIds,
  completedOpIds = [],
}: {
  projectConfigId: string;
  activeIds: Array<string>;
  completedOpIds?: Array<string>;
}) {
  const currentState = useProjectState.getState();
  return {
    projectState: {
      projectConfig: {
        ...currentState.projectConfig,
        id: projectConfigId,
        activeIds: [...activeIds],
      },
      sections: { ...currentState.sections },
      sectionImpls: { ...currentState.sectionImpls },
      sectionVariants: { ...currentState.sectionVariants },
      codeObjs: { ...currentState.codeObjs },
      codeObjImpls: { ...currentState.codeObjImpls },
      codeObjVariants: { ...currentState.codeObjVariants },
      artifactGroups: { ...currentState.artifactGroups },
      singletonSections: currentState.singletonSections,
      parentSectionMap: { ...currentState.parentSectionMap },
      shownParamIds: { ...currentState.shownParamIds },
      requiredDecodedImages: [...currentState.requiredDecodedImages],
      genCodeBinding: currentState.genCodeBinding ?? null,
    },
    completedOpIds,
    pendingOpIds: [],
  };
}

describe("receiveUISettingReveal", () => {
  beforeEach(async () => {
    ({ receiveUISettingReveal } = await import("./uiSettingRevealRequests"));
    vi.useFakeTimers();
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-1";
    });
    usePluginRuntimeStore.setState({ sortedPaneTabs: [] });
    useLocalStorage.setState({
      overviewVis: false,
      overviewTab: "Overview",
      watchCodePortalOpen: false,
      uiEditorVis: false,
      projectChatAuxViewByProjectConfigId: {},
      runInstructionsAccordionOpenValuesByProjectConfigId: {},
      projectAiSettingsAccordionOpenValuesByProjectConfigId: {},
    });
    const windowRef = globalThis as unknown as {
      window: typeof globalThis & {
        matchMedia?: (query: string) => { matches: boolean };
      };
    };
    windowRef.window = globalThis;
    windowRef.window.matchMedia = vi.fn(() => ({ matches: false }));
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn(() => null),
    };
    invokePluginSettingRevealHandlerMock.mockImplementation(
      async (args: PluginRevealInvokeArgs) => ({
        ok: false,
        message: `Plugin ${args.pluginId} has no setting reveal handlers.`,
      }),
    );
  });

  afterEach(() => {
    resetProjectStores();
    usePluginRuntimeStore.setState({ sortedPaneTabs: [] });
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("opens overview tab and highlights anchor", async () => {
    const anchor = createFakeAnchor("core.watch_code.enabled");
    const paneRoot = createFakePaneRoot(anchor);
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="rf__watch-code-settings-portal"]') {
          return paneRoot;
        }
        return null;
      }),
    };

    const statuses = await receiveUISettingReveal(createRevealContent({}));

    const localState = useLocalStorage.getState();
    expect(localState.overviewVis).toBe(true);
    expect(localState.overviewTab).toBe("Overview");
    expect(localState.watchCodePortalOpen).toBe(true);
    expect(statuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    expect(anchor.classList.contains("setta-ui-setting-reveal-highlight")).toBe(
      true,
    );

    vi.advanceTimersByTime(120);
    expect(anchor.classList.contains("setta-ui-setting-reveal-highlight")).toBe(
      false,
    );
  });

  it("keeps watch-code reveal visibility out of the persisted local-storage payload", async () => {
    const anchor = createFakeAnchor("core.watch_code.enabled");
    const paneRoot = createFakePaneRoot(anchor);
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="rf__watch-code-settings-portal"]') {
          return paneRoot;
        }
        return null;
      }),
    };

    await receiveUISettingReveal(createRevealContent({}));

    const partialize = useLocalStorage.persist.getOptions().partialize;
    if (!partialize) {
      throw new Error("Expected local-storage store to define partialize.");
    }

    const persisted = partialize(useLocalStorage.getState());

    expect(useLocalStorage.getState().watchCodePortalOpen).toBe(true);
    expect(persisted).not.toHaveProperty("watchCodePortalOpen");
  });

  it("returns a structured failure for right-pane reveals with no active section", async () => {
    const statuses = await receiveUISettingReveal(
      createRevealContent({
        reveals: [
          createRevealTarget({
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "QuickInfoConfig",
            anchorId: "core.project.show_param_display_names",
          }),
        ],
      }),
    );
    expect(useLocalStorage.getState().uiEditorVis).toBe(false);
    expect(statuses[0]).toEqual({
      settingId: "core.watch_code.enabled",
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage:
        "Right-pane reveal requires an active section. Provide sectionIdToActivate.",
    });
  });

  it("applies request-scoped activeSectionId for right-pane reveal", async () => {
    configureCodeSections({
      projectConfigId: "project-1",
      sectionIds: ["section-initial", "section-target"],
      activeIds: ["section-initial"],
    });
    const rightAnchorId = "core.code.section_variants";
    const rightAnchor = createFakeAnchor(rightAnchorId);
    const rightPaneRoot = createFakePaneRoot(rightAnchor, rightAnchorId);
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="ui-editor-tab-content-shell"]') {
          return rightPaneRoot;
        }
        return null;
      }),
    };

    const statuses = await receiveUISettingReveal(
      createRevealContent({
        activeSectionId: "section-target",
        reveals: [
          createRevealTarget({
            settingId: rightAnchorId,
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "SectionVariantsConfig",
            anchorId: rightAnchorId,
          }),
        ],
      }),
    );

    expect(statuses).toEqual([
      {
        settingId: rightAnchorId,
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-target"]);
  });

  it("cancels a queued durable active-id sync before applying a transient reveal selection", async () => {
    configureCodeSections({
      projectConfigId: "project-1",
      sectionIds: ["section-initial", "section-target"],
      activeIds: [],
    });
    const rightAnchorId = "core.code.section_variants";
    const rightAnchor = createFakeAnchor(rightAnchorId);
    const rightPaneRoot = createFakePaneRoot(rightAnchor, rightAnchorId);
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="ui-editor-tab-content-shell"]') {
          return rightPaneRoot;
        }
        return null;
      }),
    };
    const endpointSpy = vi
      .spyOn(endpoints, "route_set_active_ids")
      .mockResolvedValue({
        status: 200,
        hasResponse: true,
        data: undefined,
      });
    let scheduledFrame: FrameRequestCallback | null = null;
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      writable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        scheduledFrame = callback;
        return 17;
      }),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    setActiveSectionIds(["section-initial"]);
    expect(useActiveSectionUI.getState().scheduledBackendSync).toEqual({
      projectConfigId: "project-1",
      activeIds: ["section-initial"],
      generation: expect.any(Number),
    });

    const statuses = await receiveUISettingReveal(
      createRevealContent({
        activeSectionId: "section-target",
        reveals: [
          createRevealTarget({
            settingId: rightAnchorId,
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "SectionVariantsConfig",
            anchorId: rightAnchorId,
          }),
        ],
      }),
    );

    expect(statuses[0]?.status).toBe("revealed");
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-target"]);
    expect(useActiveSectionUI.getState().scheduledBackendSync).toBeNull();

    scheduledFrame?.(16);

    expect(endpointSpy).not.toHaveBeenCalled();
  });

  it("keeps the reveal target selected when an older durable selection ack arrives afterward", async () => {
    configureCodeSections({
      projectConfigId: "project-1",
      sectionIds: ["section-initial", "section-target"],
      activeIds: [],
    });
    const rightAnchorId = "core.code.section_variants";
    const rightAnchor = createFakeAnchor(rightAnchorId);
    const rightPaneRoot = createFakePaneRoot(rightAnchor, rightAnchorId);
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="ui-editor-tab-content-shell"]') {
          return rightPaneRoot;
        }
        return null;
      }),
    };
    const endpointSpy = vi
      .spyOn(endpoints, "route_set_active_ids")
      .mockImplementation(
        () =>
          new Promise(() => {
            return undefined;
          }),
      );

    setActiveSectionIds(["section-initial"], { syncMode: "immediate" });

    const staleOpId = endpointSpy.mock.calls[0]?.[0].frontendOpId;
    if (typeof staleOpId !== "string") {
      throw new Error("Expected a frontend op id for the durable selection.");
    }

    const statuses = await receiveUISettingReveal(
      createRevealContent({
        activeSectionId: "section-target",
        reveals: [
          createRevealTarget({
            settingId: rightAnchorId,
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "SectionVariantsConfig",
            anchorId: rightAnchorId,
          }),
        ],
      }),
    );

    processProjectStateUpdateFromBackend(
      buildBackendProjectStateUpdate({
        projectConfigId: "project-1",
        activeIds: ["section-initial"],
        completedOpIds: [staleOpId],
      }),
    );

    expect(statuses[0]?.status).toBe("revealed");
    expect(useActiveSectionUI.getState().activeIds).toEqual(["section-target"]);
    expect(useActiveSectionUI.getState().pendingBackendSyncOpIds).toEqual([]);
  });

  it("rolls back request-scoped activeSectionId and pane state when right-pane anchor lookup fails", async () => {
    configureCodeSections({
      projectConfigId: "project-1",
      sectionIds: ["section-initial", "section-target"],
      activeIds: ["section-initial"],
    });
    const rightAnchorId = "core.code.section_variants";
    const rightPaneRoot = {
      querySelector: vi.fn(() => null),
    } as unknown as HTMLElement;
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="ui-editor-tab-content-shell"]') {
          return rightPaneRoot;
        }
        return null;
      }),
    };
    const uiEditorVisBeforeReveal = useLocalStorage.getState().uiEditorVis;
    const uiEditorTabBeforeReveal =
      useLocalStorage.getState().uiEditorTab[SectionTypeEnum.Code];

    const statusesPromise = receiveUISettingReveal(
      createRevealContent({
        durationMs: 120,
        activeSectionId: "section-target",
        reveals: [
          createRevealTarget({
            settingId: rightAnchorId,
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "SectionVariantsConfig",
            anchorId: rightAnchorId,
          }),
        ],
      }),
    );
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses).toEqual([
      {
        settingId: rightAnchorId,
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: `Could not find anchor ${rightAnchorId} for ${rightAnchorId}.`,
      },
    ]);
    expect(useActiveSectionUI.getState().activeIds).toEqual([
      "section-initial",
    ]);
    const localStorageAfterReveal = useLocalStorage.getState();
    expect(localStorageAfterReveal.uiEditorVis).toBe(uiEditorVisBeforeReveal);
    expect(localStorageAfterReveal.uiEditorTab[SectionTypeEnum.Code]).toBe(
      uiEditorTabBeforeReveal,
    );
  });

  it("rolls back request-scoped activeSectionId when target section cannot resolve to a section type", async () => {
    configureCodeSections({
      projectConfigId: "project-1",
      sectionIds: ["section-initial"],
      activeIds: ["section-initial"],
    });

    // A missing section target should fail reveal and restore prior activeIds.
    const statuses = await receiveUISettingReveal(
      createRevealContent({
        activeSectionId: "section-missing",
        reveals: [
          createRevealTarget({
            settingId: "core.code.section_variants",
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "SectionVariantsConfig",
            anchorId: "core.code.section_variants",
          }),
        ],
      }),
    );

    expect(statuses).toEqual([
      {
        settingId: "core.code.section_variants",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "Right-pane reveal requires an active section. Provide sectionIdToActivate.",
      },
    ]);
    expect(useActiveSectionUI.getState().activeIds).toEqual([
      "section-initial",
    ]);
    expect(useLocalStorage.getState().uiEditorVis).toBe(false);
  });

  it("rolls back request-scoped activeSectionId when right-pane preconditions fail after activation", async () => {
    configureCodeSections({
      projectConfigId: "project-1",
      sectionIds: ["section-initial", "section-target"],
      activeIds: ["section-initial"],
    });

    // Unsupported tabs fail after activeSectionId is applied, so rollback must restore prior selection.
    const statuses = await receiveUISettingReveal(
      createRevealContent({
        activeSectionId: "section-target",
        reveals: [
          createRevealTarget({
            settingId: "core.project.show_param_display_names",
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "QuickInfoConfig",
            anchorId: "core.project.show_param_display_names",
          }),
        ],
      }),
    );

    expect(statuses).toEqual([
      {
        settingId: "core.project.show_param_display_names",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "Section type Code does not support tab QuickInfoConfig.",
      },
    ]);
    expect(useActiveSectionUI.getState().activeIds).toEqual([
      "section-initial",
    ]);
    expect(useLocalStorage.getState().uiEditorVis).toBe(false);
  });

  it("restores backend hydration after rolling back a request-scoped activeSectionId", async () => {
    configureCodeSections({
      projectConfigId: "project-1",
      sectionIds: ["section-initial", "section-target", "section-backend"],
      activeIds: ["section-initial"],
    });

    const statuses = await receiveUISettingReveal(
      createRevealContent({
        activeSectionId: "section-target",
        reveals: [
          createRevealTarget({
            settingId: "core.project.show_param_display_names",
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "QuickInfoConfig",
            anchorId: "core.project.show_param_display_names",
          }),
        ],
      }),
    );

    expect(statuses).toEqual([
      {
        settingId: "core.project.show_param_display_names",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "Section type Code does not support tab QuickInfoConfig.",
      },
    ]);
    expect(useActiveSectionUI.getState().activeIds).toEqual([
      "section-initial",
    ]);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);

    processProjectStateUpdateFromBackend(
      buildBackendProjectStateUpdate({
        projectConfigId: "project-1",
        activeIds: ["section-backend"],
      }),
    );

    expect(useActiveSectionUI.getState().activeIds).toEqual([
      "section-backend",
    ]);
  });

  it("rolls back request-scoped activeSectionId on execution-context mismatch", async () => {
    configureCodeSections({
      projectConfigId: "project-1",
      sectionIds: ["section-initial", "section-target"],
      activeIds: ["section-initial"],
    });
    const statuses = await receiveUISettingReveal(
      createRevealContent({
        activeSectionId: "section-target",
        reveals: [
          createRevealTarget({
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "SectionVariantsConfig",
            anchorId: "core.code.section_variants",
          }),
        ],
      }),
      {
        requestId: "request-active-section-rollback",
        requestedProjectConfigId: "project-1",
        socketGeneration: 1,
        isSocketGenerationActive: (() => {
          let checks = 0;
          return () => {
            checks += 1;
            return checks < 2;
          };
        })(),
      },
    );

    expect(statuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: websocket generation changed before request request-active-section-rollback completed.",
      },
    ]);
    expect(useActiveSectionUI.getState().activeIds).toEqual([
      "section-initial",
    ]);
  });

  it("limits anchor lookup to the active pane root", async () => {
    const paneRoot = {
      querySelector: vi.fn(() => null),
    } as unknown as HTMLElement;
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };

    const statusesPromise = receiveUISettingReveal(createRevealContent({}));
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses[0]).toEqual({
      settingId: "core.watch_code.enabled",
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage:
        "Could not find anchor core.watch_code.enabled for core.watch_code.enabled.",
    });
    expect(paneRoot.querySelector).toHaveBeenCalled();
  });

  it("waits up to durationMs for a delayed anchor before failing", async () => {
    const anchor = createFakeAnchor("core.watch_code.enabled");
    const paneRoot = {
      querySelector: vi.fn((selector: string) => {
        if (
          selector === '[data-setting-anchor="core.watch_code.enabled"]' &&
          Date.now() >= 2500
        ) {
          return anchor;
        }
        return null;
      }),
    } as unknown as HTMLElement;
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };

    const statusesPromise = receiveUISettingReveal(
      createRevealContent({
        durationMs: 4000,
      }),
    );
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses[0]).toEqual({
      settingId: "core.watch_code.enabled",
      status: "revealed",
      errorCode: null,
      errorMessage: null,
    });
    expect(anchor.scrollIntoView).toHaveBeenCalled();
  });

  it("applies Project AI accordion activation steps before anchor lookup", async () => {
    const anchorId = "core.project_ai_settings.prompt_templates";
    const anchor = createFakeAnchor(anchorId);
    const paneRoot = createFakePaneRoot(anchor, anchorId);
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };

    const statuses = await receiveUISettingReveal(
      createRevealContent({
        reveals: [
          createRevealTarget({
            settingId: anchorId,
            overviewTabKey: "ProjectAIChat",
            anchorId,
            revealActivationSteps: [
              {
                type: "project_ai_settings_accordion_item",
                itemValue: "project-ai-settings-prompt-templates",
              },
            ],
          }),
        ],
      }),
    );

    expect(statuses[0]?.status).toBe("revealed");
    const state = useLocalStorage.getState();
    expect(
      state.projectAiSettingsAccordionOpenValuesByProjectConfigId["project-1"],
    ).toContain("project-ai-settings-prompt-templates");
    expect(state.projectChatAuxViewByProjectConfigId["project-1"]).toBe(
      "ai_settings",
    );
  });

  it("applies Run Instructions accordion activation steps before anchor lookup", async () => {
    const anchorId = "core.run_instructions.python_codegen_enabled";
    const anchor = createFakeAnchor(anchorId);
    const paneRoot = createFakePaneRoot(anchor, anchorId);
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };

    const statuses = await receiveUISettingReveal(
      createRevealContent({
        reveals: [
          createRevealTarget({
            settingId: anchorId,
            overviewTabKey: "RunInstructions",
            anchorId,
            revealActivationSteps: [
              {
                type: "run_instructions_accordion_item",
                itemValue: "run-instructions-codegen-targets",
              },
            ],
          }),
        ],
      }),
    );

    expect(statuses[0]?.status).toBe("revealed");
    const state = useLocalStorage.getState();
    expect(
      state.runInstructionsAccordionOpenValuesByProjectConfigId["project-1"],
    ).toContain("run-instructions-codegen-targets");
  });

  it("fails fast when requested reveal project does not match the active project", async () => {
    const anchorId = "core.run_instructions.python_codegen_enabled";
    const anchor = createFakeAnchor(anchorId);
    const paneRoot = createFakePaneRoot(anchor, anchorId);
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-active";
    });

    const statuses = await receiveUISettingReveal(
      createRevealContent({
        projectConfigId: "project-request",
        reveals: [
          createRevealTarget({
            settingId: anchorId,
            overviewTabKey: "RunInstructions",
            anchorId,
            revealActivationSteps: [
              {
                type: "run_instructions_accordion_item",
                itemValue: "run-instructions-codegen-targets",
              },
            ],
          }),
        ],
      }),
    );

    expect(statuses).toEqual([
      {
        settingId: anchorId,
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal project mismatch: requested project project-request but active project is project-active.",
      },
    ]);
    const state = useLocalStorage.getState();
    expect(
      state.runInstructionsAccordionOpenValuesByProjectConfigId[
        "project-request"
      ],
    ).toBeUndefined();
    expect(
      state.runInstructionsAccordionOpenValuesByProjectConfigId[
        "project-active"
      ],
    ).toBeUndefined();
    expect(docRef.document.querySelector).not.toHaveBeenCalled();
  });

  it("fails before mutation when reveal execution context socket generation is stale", async () => {
    const statuses = await receiveUISettingReveal(createRevealContent({}), {
      requestId: "request-stale-generation",
      requestedProjectConfigId: "project-1",
      socketGeneration: 1,
      isSocketGenerationActive: () => false,
    });

    expect(statuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: websocket generation changed before request request-stale-generation completed.",
      },
    ]);
    expect(useLocalStorage.getState().overviewVis).toBe(false);
  });

  it("rolls back pane mutations when execution context flips after pane open", async () => {
    const statuses = await receiveUISettingReveal(createRevealContent({}), {
      requestId: "request-pane-mutation-rollback",
      requestedProjectConfigId: "project-1",
      socketGeneration: 1,
      isSocketGenerationActive: (() => {
        let checks = 0;
        return () => {
          checks += 1;
          return checks < 5;
        };
      })(),
    });

    expect(statuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: websocket generation changed before request request-pane-mutation-rollback completed.",
      },
    ]);
    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(false);
    expect(state.overviewTab).toBe("Overview");
    expect(state.watchCodePortalOpen).toBe(false);
  });

  it("rolls back a failed older reveal without clobbering a newer non-overlapping reveal", async () => {
    const rightAnchorId = "core.code.section_variants";
    const rightAnchor = createFakeAnchor(rightAnchorId);
    const leftPaneRoot = {
      querySelector: vi.fn(() => null),
    } as unknown as HTMLElement;
    const rightPaneRoot = createFakePaneRoot(rightAnchor, rightAnchorId);
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return leftPaneRoot;
        }
        if (selector === '[data-testid="ui-editor-tab-content-shell"]') {
          return rightPaneRoot;
        }
        return null;
      }),
    };
    setActiveSectionType(SectionTypeEnum.Code);

    let requestAContextActive = true;
    const requestAPromise = receiveUISettingReveal(
      createRevealContent({ projectConfigId: "project-active" }),
      {
        requestId: "request-concurrent-a-non-overlap",
        requestedProjectConfigId: "project-active",
        socketGeneration: 1,
        isSocketGenerationActive: () => requestAContextActive,
      },
    );
    await vi.advanceTimersByTimeAsync(80);

    const requestBStatuses = await receiveUISettingReveal(
      createRevealContent({
        projectConfigId: "project-active",
        reveals: [
          createRevealTarget({
            settingId: rightAnchorId,
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "SectionVariantsConfig",
            anchorId: rightAnchorId,
          }),
        ],
      }),
    );
    expect(requestBStatuses[0]?.status).toBe("revealed");

    requestAContextActive = false;
    await vi.runAllTimersAsync();
    const requestAStatuses = await requestAPromise;

    expect(requestAStatuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: websocket generation changed before request request-concurrent-a-non-overlap completed.",
      },
    ]);
    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(false);
    expect(state.overviewTab).toBe("Overview");
    expect(state.watchCodePortalOpen).toBe(false);
    expect(state.uiEditorVis).toBe(true);
    expect(state.uiEditorTab[SectionTypeEnum.Code]).toBe(
      "SectionVariantsConfig",
    );
  });

  it("keeps overlapping pane keys owned by a newer reveal when an older reveal rolls back", async () => {
    const leftWatchCodeAnchorId = "core.watch_code.enabled";
    const leftRunInstructionsAnchorId =
      "core.run_instructions.python_codegen_enabled";
    const leftRunInstructionsAnchor = createFakeAnchor(
      leftRunInstructionsAnchorId,
    );
    const leftPaneRoot = {
      querySelector: vi.fn((selector: string) => {
        if (
          selector === `[data-setting-anchor="${leftRunInstructionsAnchorId}"]`
        ) {
          return leftRunInstructionsAnchor;
        }
        if (selector === `[data-setting-anchor="${leftWatchCodeAnchorId}"]`) {
          return null;
        }
        return null;
      }),
    } as unknown as HTMLElement;
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return leftPaneRoot;
        }
        return null;
      }),
    };

    let requestAContextActive = true;
    const requestAPromise = receiveUISettingReveal(createRevealContent({}), {
      requestId: "request-concurrent-a-overlap",
      requestedProjectConfigId: "project-1",
      socketGeneration: 1,
      isSocketGenerationActive: () => requestAContextActive,
    });
    await vi.advanceTimersByTimeAsync(80);

    const requestBStatuses = await receiveUISettingReveal(
      createRevealContent({
        reveals: [
          createRevealTarget({
            settingId: leftRunInstructionsAnchorId,
            side: "left",
            overviewTabKey: "RunInstructions",
            anchorId: leftRunInstructionsAnchorId,
          }),
        ],
      }),
    );
    expect(requestBStatuses[0]?.status).toBe("revealed");

    requestAContextActive = false;
    await vi.runAllTimersAsync();
    const requestAStatuses = await requestAPromise;

    expect(requestAStatuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: websocket generation changed before request request-concurrent-a-overlap completed.",
      },
    ]);
    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(true);
    expect(state.overviewTab).toBe("RunInstructions");
  });

  it("preserves manual pane changes during project-switch rollback", async () => {
    const anchor = createFakeAnchor("core.watch_code.enabled");
    const startMs = Date.now();
    const paneRoot = {
      querySelector: vi.fn((selector: string) => {
        if (
          selector === '[data-setting-anchor="core.watch_code.enabled"]' &&
          Date.now() - startMs >= 300
        ) {
          return anchor;
        }
        return null;
      }),
    } as unknown as HTMLElement;
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };
    window.setTimeout(() => {
      useLocalStorage.setState({
        overviewVis: false,
        overviewTab: "RunInstructions",
      });
      useProjectState.setState((state) => {
        state.projectConfig.id = "project-switched";
      });
    }, 120);

    const statusesPromise = receiveUISettingReveal(createRevealContent({}), {
      requestId: "request-pane-project-switch-rollback-manual-preserve",
      requestedProjectConfigId: "project-1",
      socketGeneration: 1,
      isSocketGenerationActive: () => true,
    });
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: requested project project-1 but active project is project-switched.",
      },
    ]);
    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(false);
    expect(state.overviewTab).toBe("RunInstructions");
  });

  it("rolls back activation-step mutations when execution context flips after activation", async () => {
    const statuses = await receiveUISettingReveal(
      createRevealContent({
        reveals: [
          createRevealTarget({
            settingId: "core.run_instructions.python_codegen_enabled",
            overviewTabKey: "RunInstructions",
            anchorId: "core.run_instructions.python_codegen_enabled",
            revealActivationSteps: [
              {
                type: "run_instructions_accordion_item",
                itemValue: "run-instructions-codegen-targets",
              },
            ],
          }),
        ],
      }),
      {
        requestId: "request-activation-rollback",
        requestedProjectConfigId: "project-1",
        socketGeneration: 1,
        isSocketGenerationActive: (() => {
          let checks = 0;
          return () => {
            checks += 1;
            return checks < 6;
          };
        })(),
      },
    );

    expect(statuses).toEqual([
      {
        settingId: "core.run_instructions.python_codegen_enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: websocket generation changed before request request-activation-rollback completed.",
      },
    ]);
    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(false);
    expect(state.overviewTab).toBe("Overview");
    expect(state.watchCodePortalOpen).toBe(false);
    expect(
      state.runInstructionsAccordionOpenValuesByProjectConfigId["project-1"],
    ).toBeUndefined();
  });

  it("preserves manual activation-step changes during project-switch rollback", async () => {
    const anchor = createFakeAnchor(
      "core.run_instructions.python_codegen_enabled",
    );
    const startMs = Date.now();
    const paneRoot = {
      querySelector: vi.fn((selector: string) => {
        if (
          selector ===
            '[data-setting-anchor="core.run_instructions.python_codegen_enabled"]' &&
          Date.now() - startMs >= 300
        ) {
          return anchor;
        }
        return null;
      }),
    } as unknown as HTMLElement;
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };
    window.setTimeout(() => {
      useLocalStorage.setState({
        runInstructionsAccordionOpenValuesByProjectConfigId: {
          "project-1": ["manual-run-instructions-open-item"],
        },
      });
      useProjectState.setState((state) => {
        state.projectConfig.id = "project-switched";
      });
    }, 120);

    const statusesPromise = receiveUISettingReveal(
      createRevealContent({
        reveals: [
          createRevealTarget({
            settingId: "core.run_instructions.python_codegen_enabled",
            overviewTabKey: "RunInstructions",
            anchorId: "core.run_instructions.python_codegen_enabled",
            revealActivationSteps: [
              {
                type: "run_instructions_accordion_item",
                itemValue: "run-instructions-codegen-targets",
              },
            ],
          }),
        ],
      }),
      {
        requestId: "request-activation-project-switch-rollback-manual-preserve",
        requestedProjectConfigId: "project-1",
        socketGeneration: 1,
        isSocketGenerationActive: () => true,
      },
    );
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses).toEqual([
      {
        settingId: "core.run_instructions.python_codegen_enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: requested project project-1 but active project is project-switched.",
      },
    ]);
    const state = useLocalStorage.getState();
    expect(
      state.runInstructionsAccordionOpenValuesByProjectConfigId["project-1"],
    ).toEqual(["manual-run-instructions-open-item"]);
  });

  it("fails when project switches during async anchor lookup", async () => {
    const anchor = createFakeAnchor("core.watch_code.enabled");
    const startMs = Date.now();
    const paneRoot = {
      querySelector: vi.fn((selector: string) => {
        if (
          selector === '[data-setting-anchor="core.watch_code.enabled"]' &&
          Date.now() - startMs >= 300
        ) {
          return anchor;
        }
        return null;
      }),
    } as unknown as HTMLElement;
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };
    window.setTimeout(() => {
      useProjectState.setState((state) => {
        state.projectConfig.id = "project-switched";
      });
    }, 120);

    const statusesPromise = receiveUISettingReveal(createRevealContent({}), {
      requestId: "request-project-switch",
      requestedProjectConfigId: "project-1",
      socketGeneration: 1,
      isSocketGenerationActive: () => true,
    });
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses).toEqual([
      {
        settingId: "core.watch_code.enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: requested project project-1 but active project is project-switched.",
      },
    ]);
    expect(anchor.scrollIntoView).not.toHaveBeenCalled();
    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(false);
    expect(state.overviewTab).toBe("Overview");
    expect(state.watchCodePortalOpen).toBe(false);
  });

  it("keeps other-project local accordion state when rollback runs after project switch", async () => {
    const anchor = createFakeAnchor(
      "core.run_instructions.python_codegen_enabled",
    );
    const startMs = Date.now();
    const paneRoot = {
      querySelector: vi.fn((selector: string) => {
        if (
          selector ===
            '[data-setting-anchor="core.run_instructions.python_codegen_enabled"]' &&
          Date.now() - startMs >= 300
        ) {
          return anchor;
        }
        return null;
      }),
    } as unknown as HTMLElement;
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };
    window.setTimeout(() => {
      useProjectState.setState((state) => {
        state.projectConfig.id = "project-switched";
      });
      useLocalStorage.setState({
        runInstructionsAccordionOpenValuesByProjectConfigId: {
          "project-switched": ["manual-project-switched-open-item"],
        },
      });
    }, 120);

    const statusesPromise = receiveUISettingReveal(
      createRevealContent({
        reveals: [
          createRevealTarget({
            settingId: "core.run_instructions.python_codegen_enabled",
            overviewTabKey: "RunInstructions",
            anchorId: "core.run_instructions.python_codegen_enabled",
            revealActivationSteps: [
              {
                type: "run_instructions_accordion_item",
                itemValue: "run-instructions-codegen-targets",
              },
            ],
          }),
        ],
      }),
      {
        requestId: "request-project-switch-activation",
        requestedProjectConfigId: "project-1",
        socketGeneration: 1,
        isSocketGenerationActive: () => true,
      },
    );
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses).toEqual([
      {
        settingId: "core.run_instructions.python_codegen_enabled",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: requested project project-1 but active project is project-switched.",
      },
    ]);
    const state = useLocalStorage.getState();
    expect(
      state.runInstructionsAccordionOpenValuesByProjectConfigId[
        "project-switched"
      ],
    ).toEqual(["manual-project-switched-open-item"]);
  });

  it("fails fast when right-pane tab is unsupported for the active section type", async () => {
    setActiveSectionType(SectionTypeEnum.Code);

    const statuses = await receiveUISettingReveal(
      createRevealContent({
        projectConfigId: "project-active",
        reveals: [
          createRevealTarget({
            settingId: "core.project.show_param_display_names",
            side: "right",
            overviewTabKey: null,
            uiEditorTabName: "QuickInfoConfig",
            anchorId: "core.project.show_param_display_names",
          }),
        ],
      }),
    );

    expect(statuses).toEqual([
      {
        settingId: "core.project.show_param_display_names",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: "Section type Code does not support tab QuickInfoConfig.",
      },
    ]);
    expect(useLocalStorage.getState().uiEditorVis).toBe(false);
  });

  it("retries plugin reveal until the plugin tab becomes available", async () => {
    window.setTimeout(() => {
      usePluginRuntimeStore.setState({
        sortedPaneTabs: [
          {
            tabKey: "PluginPane:plugin-a:pane-1",
            pluginId: "plugin-a",
            paneId: "pane-1",
            title: "Plugin Pane",
            description: "Plugin pane description",
          },
        ],
      });
    }, 150);

    const statusesPromise = receiveUISettingReveal(
      createRevealContent({
        durationMs: 1200,
        reveals: [
          createRevealTarget({
            settingId: "plugin::plugin-a::label",
            side: "left",
            overviewTabKey: "PluginPane:plugin-a:pane-1",
            strategy: "plugin_handler",
            pluginId: "plugin-a",
            paneId: "pane-1",
            pluginRevealKey: "pane-reveal",
            anchorId: null,
          }),
        ],
      }),
    );
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses[0]).toEqual({
      settingId: "plugin::plugin-a::label",
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage:
        "Plugin plugin-a has no setting reveal handlers. No fallback anchorId is available.",
    });
  });

  it("keeps retrying plugin reveal beyond 2s until the plugin tab appears", async () => {
    window.setTimeout(() => {
      usePluginRuntimeStore.setState({
        sortedPaneTabs: [
          {
            tabKey: "PluginPane:plugin-a:pane-1",
            pluginId: "plugin-a",
            paneId: "pane-1",
            title: "Plugin Pane",
            description: "Plugin pane description",
          },
        ],
      });
    }, 3000);

    const statusesPromise = receiveUISettingReveal(
      createRevealContent({
        durationMs: 8000,
        reveals: [
          createRevealTarget({
            settingId: "plugin::plugin-a::label",
            side: "left",
            overviewTabKey: "PluginPane:plugin-a:pane-1",
            strategy: "plugin_handler",
            pluginId: "plugin-a",
            paneId: "pane-1",
            pluginRevealKey: "pane-reveal",
            anchorId: null,
          }),
        ],
      }),
    );
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses[0]).toEqual({
      settingId: "plugin::plugin-a::label",
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage:
        "Plugin plugin-a has no setting reveal handlers. No fallback anchorId is available.",
    });
  });

  it("includes a mount-timeout detail when plugin pane never appears", async () => {
    const statusesPromise = receiveUISettingReveal(
      createRevealContent({
        durationMs: 600,
        reveals: [
          createRevealTarget({
            settingId: "plugin::plugin-a::label",
            side: "left",
            overviewTabKey: "PluginPane:plugin-a:pane-1",
            strategy: "plugin_handler",
            pluginId: "plugin-a",
            paneId: "pane-1",
            pluginRevealKey: "pane-reveal",
            anchorId: null,
          }),
        ],
      }),
    );
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses[0]?.status).toBe("failed");
    expect(statuses[0]?.errorMessage).toContain(
      "did not become available before reveal timeout.",
    );
  });

  it("surfaces plugin reveal handler failures when no fallback anchor is available", async () => {
    usePluginRuntimeStore.setState({
      sortedPaneTabs: [
        {
          tabKey: "PluginPane:plugin-a:pane-1",
          pluginId: "plugin-a",
          paneId: "pane-1",
          title: "Plugin Pane",
          description: "Plugin pane description",
        },
      ],
    });

    const statusesPromise = receiveUISettingReveal(
      createRevealContent({
        reveals: [
          createRevealTarget({
            settingId: "plugin::plugin-a::label",
            side: "left",
            overviewTabKey: "PluginPane:plugin-a:pane-1",
            strategy: "plugin_handler",
            pluginId: "plugin-a",
            pluginRevealKey: "pane-reveal",
            anchorId: null,
          }),
        ],
      }),
    );
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses[0]).toEqual({
      settingId: "plugin::plugin-a::label",
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage:
        "Plugin plugin-a has no setting reveal handlers. No fallback anchorId is available.",
    });
  });

  it("does not retry terminal plugin handler failures once the tab is available", async () => {
    usePluginRuntimeStore.setState({
      sortedPaneTabs: [
        {
          tabKey: "PluginPane:plugin-a:pane-1",
          pluginId: "plugin-a",
          paneId: "pane-1",
          title: "Plugin Pane",
          description: "Plugin pane description",
        },
      ],
    });
    const startMs = Date.now();
    const statusesPromise = receiveUISettingReveal(
      createRevealContent({
        durationMs: 8000,
        reveals: [
          createRevealTarget({
            settingId: "plugin::plugin-a::label",
            side: "left",
            overviewTabKey: "PluginPane:plugin-a:pane-1",
            strategy: "plugin_handler",
            pluginId: "plugin-a",
            paneId: "pane-1",
            pluginRevealKey: "pane-reveal",
            anchorId: null,
          }),
        ],
      }),
    );
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses[0]).toEqual({
      settingId: "plugin::plugin-a::label",
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage:
        "Plugin plugin-a has no setting reveal handlers. No fallback anchorId is available.",
    });
    expect(Date.now() - startMs).toBeLessThan(1000);
  });

  it("enforces one reveal deadline across all targets in a batch", async () => {
    const paneRoot = {
      querySelector: vi.fn(() => null),
    } as unknown as HTMLElement;
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };

    const statusesPromise = receiveUISettingReveal(
      createRevealContent({
        durationMs: 100,
        reveals: [
          createRevealTarget({
            settingId: "core.watch_code.enabled",
          }),
          createRevealTarget({
            settingId: "core.project.name",
            anchorId: "core.project.name",
          }),
        ],
      }),
    );
    await vi.runAllTimersAsync();
    const statuses = await statusesPromise;

    expect(statuses[0]?.status).toBe("failed");
    expect(statuses[1]).toEqual({
      settingId: "core.project.name",
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage:
        "Reveal deadline exceeded before processing core.project.name.",
    });
  });
});
