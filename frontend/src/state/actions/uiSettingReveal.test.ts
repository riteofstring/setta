import { usePluginRuntimeStore } from "plugins/runtime";
import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import type {
  UISettingRevealContent,
  UISettingRevealTarget,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("plugins/runtime", async () => {
  const actual = await vi.importActual<typeof import("plugins/runtime")>(
    "plugins/runtime",
  );
  return {
    ...actual,
    invokePluginSettingRevealHandler: vi.fn(
      async (args: { pluginId: string }) => ({
        ok: false,
        message: `Plugin ${args.pluginId} has no setting reveal handlers.`,
      }),
    ),
  };
});

import { receiveUISettingReveal } from "./uiSettingReveal";

type UISettingRevealActivationStep = {
  type:
    | "project_ai_settings_accordion_item"
    | "run_instructions_accordion_item";
  itemValue: string;
};

type UISettingRevealTargetWithActivationSteps = UISettingRevealTarget & {
  revealActivationSteps?: Array<UISettingRevealActivationStep> | null;
};

function createRevealTarget(
  overrides: Partial<UISettingRevealTargetWithActivationSteps>,
): UISettingRevealTargetWithActivationSteps {
  return {
    settingId: "core.watch_code.enabled",
    side: "left",
    overviewTabKey: "WatchCode",
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

describe("receiveUISettingReveal", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    resetProjectStores();
    usePluginRuntimeStore.setState({ sortedPaneTabs: [] });
    useLocalStorage.setState({
      overviewVis: false,
      overviewTab: "Overview",
      uiEditorVis: false,
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
    const pluginRuntimeModule = await import("plugins/runtime");
    vi.mocked(
      pluginRuntimeModule.invokePluginSettingRevealHandler,
    ).mockImplementation(async (args: { pluginId: string }) => ({
      ok: false,
      message: `Plugin ${args.pluginId} has no setting reveal handlers.`,
    }));
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
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
    };

    const statuses = await receiveUISettingReveal(createRevealContent({}));

    const localState = useLocalStorage.getState();
    expect(localState.overviewVis).toBe(true);
    expect(localState.overviewTab).toBe("WatchCode");
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
            overviewTabKey: "ProjectAISettings",
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
});
