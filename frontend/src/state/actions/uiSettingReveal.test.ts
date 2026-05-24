import * as endpoints from "openapi/http";
import {
  buildBackendProjectStateUpdate,
  cleanupUISettingRevealTest,
  configureCodeSections,
  createFakeAnchor,
  createFakePaneRoot,
  createRevealContent,
  createRevealTarget,
  setupUISettingRevealTest,
  type UISettingRevealModule,
} from "state/actions/uiSettingReveal.test.support";
import { useActiveSectionUI } from "state/activeSectionUI";
import { useLocalStorage } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSectionIds } from "./activeSections";
import { processProjectStateUpdateFromBackend } from "./sectionInfos";

let receiveUISettingReveal: UISettingRevealModule["receiveUISettingReveal"];
let parseUISettingRevealContent: UISettingRevealModule["parseUISettingRevealContent"];

describe("receiveUISettingReveal", () => {
  beforeEach(async () => {
    ({ receiveUISettingReveal, parseUISettingRevealContent } =
      await setupUISettingRevealTest());
  });
  afterEach(cleanupUISettingRevealTest);
  it("parses omitted reveal activation steps and duration with frontend defaults", () => {
    expect(
      parseUISettingRevealContent({
        projectConfigId: "project-1",
        chatId: null,
        reveals: [
          {
            settingId: "plugin::setta-watch-code::files",
            side: "left",
            overviewTabKey: "WatchCode",
            strategy: "dom_anchor",
          },
        ],
        requestId: "request-1",
      }),
    ).toEqual({
      projectConfigId: "project-1",
      chatId: null,
      activeSectionId: null,
      reveals: [
        {
          settingId: "plugin::setta-watch-code::files",
          side: "left",
          overviewTabKey: "WatchCode",
          uiEditorTabName: null,
          pluginId: null,
          paneId: null,
          strategy: "dom_anchor",
          anchorId: null,
          pluginRevealKey: null,
          revealActivationSteps: [],
        },
      ],
      durationMs: 3000,
      requestId: "request-1",
    });
  });
  it("rejects malformed reveal activation steps during frontend parsing", () => {
    expect(
      parseUISettingRevealContent({
        projectConfigId: "project-1",
        chatId: null,
        reveals: [
          {
            settingId: "plugin::setta-watch-code::files",
            side: "left",
            overviewTabKey: "WatchCode",
            strategy: "dom_anchor",
            revealActivationSteps: {},
          },
        ],
        durationMs: 3000,
        requestId: "request-1",
      }),
    ).toBeNull();
  });
  it("opens overview tab and highlights anchor", async () => {
    const anchor = createFakeAnchor("plugin::setta-watch-code::files");
    const paneRoot = createFakePaneRoot(anchor);
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
    const statuses = await receiveUISettingReveal(createRevealContent({}));
    const localState = useLocalStorage.getState();
    expect(localState.overviewVis).toBe(true);
    expect(localState.overviewTab).toBe("Overview");
    expect(statuses).toEqual([
      {
        settingId: "plugin::setta-watch-code::files",
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
      settingId: "plugin::setta-watch-code::files",
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
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockResolvedValue({
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
    const endpointSpy = vi.spyOn(endpoints, "setActiveIds").mockImplementation(
      () =>
        new Promise(() => {
          return undefined;
        }),
    );
    setActiveSectionIds(["section-initial"], { syncMode: "immediate" });
    const staleOpId = endpointSpy.mock.calls[0]?.[0].body?.frontendOpId;
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
        settingId: "plugin::setta-watch-code::files",
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
      settingId: "plugin::setta-watch-code::files",
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage:
        "Could not find anchor plugin::setta-watch-code::files for plugin::setta-watch-code::files.",
    });
    expect(paneRoot.querySelector).toHaveBeenCalled();
  });
  it("waits up to durationMs for a delayed anchor before failing", async () => {
    const anchor = createFakeAnchor("plugin::setta-watch-code::files");
    const paneRoot = {
      querySelector: vi.fn((selector: string) => {
        if (
          selector ===
            '[data-setting-anchor="plugin::setta-watch-code::files"]' &&
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
      settingId: "plugin::setta-watch-code::files",
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
});
