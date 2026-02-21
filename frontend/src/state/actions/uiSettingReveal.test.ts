import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import type {
  UISettingRevealContent,
  UISettingRevealTarget,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { receiveUISettingReveal } from "./uiSettingReveal";

function createRevealTarget(
  overrides: Partial<UISettingRevealTarget>,
): UISettingRevealTarget {
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

function createFakePaneRoot(anchor: HTMLElement): HTMLElement {
  return {
    querySelectorAll: vi.fn(() => [anchor]),
  } as unknown as HTMLElement;
}

describe("receiveUISettingReveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetProjectStores();
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
        querySelectorAll: (selector: string) => Array<HTMLElement>;
      };
    };
    docRef.document = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
    };
  });

  afterEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("opens overview tab and highlights anchor", async () => {
    const anchor = createFakeAnchor("core.watch_code.enabled");
    const paneRoot = createFakePaneRoot(anchor);
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
        querySelectorAll: (selector: string) => Array<HTMLElement>;
      };
    };
    docRef.document = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-testid="overview-tab-content-shell"]') {
          return paneRoot;
        }
        return null;
      }),
      querySelectorAll: vi.fn(() => []),
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
    const globalAnchor = createFakeAnchor("core.watch_code.enabled");
    const docRef = globalThis as unknown as {
      document: {
        querySelector: (selector: string) => HTMLElement | null;
        querySelectorAll: (selector: string) => Array<HTMLElement>;
      };
    };
    docRef.document = {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => [globalAnchor]),
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
  });
});
