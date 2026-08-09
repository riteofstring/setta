import {
  cleanupUISettingRevealTest,
  createFakeAnchor,
  createFakePaneRoot,
  createRevealContent,
  createRevealTarget,
  getInvokePluginSettingRevealHandler,
  getInvokePluginSettingRevealHandlerMock,
  getPluginRuntimeStore,
  setActiveSectionType,
  setupUISettingRevealTest,
  type UISettingRevealModule,
} from "state/actions/uiSettingReveal.test.support";
import { useLocalStorage, useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let receiveUISettingReveal: UISettingRevealModule["receiveUISettingReveal"];

describe("receiveUISettingReveal rollback and plugin reveal", () => {
  beforeEach(async () => {
    ({ receiveUISettingReveal } = await setupUISettingRevealTest());
  });
  afterEach(cleanupUISettingRevealTest);

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
        settingId: "plugin::setta-watch-code::files",
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
        settingId: "plugin::setta-watch-code::files",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: websocket generation changed before request request-pane-mutation-rollback completed.",
      },
    ]);
    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(false);
    expect(state.overviewTab).toBe("Overview");
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
        settingId: "plugin::setta-watch-code::files",
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage:
          "UI setting reveal execution context mismatch: websocket generation changed before request request-concurrent-a-non-overlap completed.",
      },
    ]);
    const state = useLocalStorage.getState();
    expect(state.overviewVis).toBe(false);
    expect(state.overviewTab).toBe("Overview");
    expect(state.uiEditorVis).toBe(true);
    expect(state.uiEditorTab[SectionTypeEnum.Code]).toBe(
      "SectionVariantsConfig",
    );
  });
  it("keeps overlapping pane keys owned by a newer reveal when an older reveal rolls back", async () => {
    const leftWatchCodeAnchorId = "plugin::setta-watch-code::files";
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
        settingId: "plugin::setta-watch-code::files",
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
    const anchor = createFakeAnchor("plugin::setta-watch-code::files");
    const startMs = Date.now();
    const paneRoot = {
      querySelector: vi.fn((selector: string) => {
        if (
          selector ===
            '[data-setting-anchor="plugin::setta-watch-code::files"]' &&
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
        settingId: "plugin::setta-watch-code::files",
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
    const anchor = createFakeAnchor("plugin::setta-watch-code::files");
    const startMs = Date.now();
    const paneRoot = {
      querySelector: vi.fn((selector: string) => {
        if (
          selector ===
            '[data-setting-anchor="plugin::setta-watch-code::files"]' &&
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
        settingId: "plugin::setta-watch-code::files",
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
      getPluginRuntimeStore().setState({
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
      getPluginRuntimeStore().setState({
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
    getPluginRuntimeStore().setState({
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
  it("invokes plugin reveal handlers that are not backed by pane tabs", async () => {
    getInvokePluginSettingRevealHandlerMock().mockResolvedValueOnce({
      ok: true,
      message: null,
    });
    const statuses = await receiveUISettingReveal(
      createRevealContent({
        reveals: [
          createRevealTarget({
            settingId: "plugin::setta-watch-code::files",
            side: "left",
            overviewTabKey: null,
            strategy: "plugin_handler",
            pluginId: "setta-watch-code",
            paneId: null,
            pluginRevealKey: "watch-code-settings",
            anchorId: null,
          }),
        ],
      }),
    );
    expect(statuses).toEqual([
      {
        settingId: "plugin::setta-watch-code::files",
        status: "revealed",
        errorCode: null,
        errorMessage: null,
      },
    ]);
    expect(getInvokePluginSettingRevealHandler()).toHaveBeenCalledWith({
      pluginId: "setta-watch-code",
      revealKey: "watch-code-settings",
      settingId: "plugin::setta-watch-code::files",
      paneId: null,
      durationMs: expect.any(Number),
      abortSignal: expect.any(AbortSignal),
    });
  });
  it("does not retry terminal plugin handler failures once the tab is available", async () => {
    getPluginRuntimeStore().setState({
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
            settingId: "plugin::setta-watch-code::files",
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
