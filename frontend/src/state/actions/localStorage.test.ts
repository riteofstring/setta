import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  OverviewNotificationsPaneTabEnum,
  OverviewTabNameEnum,
} from "utils/constants";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  setColorModePreference,
  setOverviewProjectConfigOrder,
} from "./localStorage";

describe("setColorModePreference", () => {
  beforeEach(() => {
    useLocalStorage.setState({ darkMode: true, colorMode: "dark" });
  });

  it("updates darkMode when selecting a specific mode", () => {
    setColorModePreference("light");

    const state = useLocalStorage.getState();
    expect(state.colorMode).toBe("light");
    expect(state.darkMode).toBe(false);
  });

  it("keeps the current darkMode when selecting auto", () => {
    useLocalStorage.setState({ darkMode: false, colorMode: "light" });

    setColorModePreference("auto");

    const state = useLocalStorage.getState();
    expect(state.colorMode).toBe("auto");
    expect(state.darkMode).toBe(false);
  });
});

describe("local storage merge", () => {
  it("derives colorMode from darkMode when missing", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      { darkMode: false } as Record<string, unknown>,
      current,
    ) as typeof current;

    expect(merged.colorMode).toBe("light");
  });

  it("keeps persisted colorMode when provided", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      { colorMode: "auto", darkMode: true } as Record<string, unknown>,
      current,
    ) as typeof current;

    expect(merged.colorMode).toBe("auto");
  });

  it("sanitizes invalid persisted overviewTab values", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      { overviewTab: "InvalidOverviewTabValue" } as Record<string, unknown>,
      current,
    ) as typeof current;

    expect(merged.overviewTab).toBe(OverviewTabNameEnum.Overview);
  });

  it("migrates persisted BackendLogs overview tab to Notifications pane logs tab", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      { overviewTab: OverviewTabNameEnum.BackendLogs } as Record<
        string,
        unknown
      >,
      current,
    ) as typeof current;

    expect(merged.overviewTab).toBe(OverviewTabNameEnum.Notifications);
    expect(merged.overviewNotificationsPaneTab).toBe(
      OverviewNotificationsPaneTabEnum.BackendLogs,
    );
  });

  it("migrates persisted WatchCode overview tab to Overview", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      { overviewTab: OverviewTabNameEnum.WatchCode } as Record<string, unknown>,
      current,
    ) as typeof current;

    expect(merged.overviewTab).toBe(OverviewTabNameEnum.Overview);
  });

  it("sanitizes invalid notifications pane tab values", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      { overviewNotificationsPaneTab: "invalid-tab" } as Record<
        string,
        unknown
      >,
      current,
    ) as typeof current;

    expect(merged.overviewNotificationsPaneTab).toBe(
      OverviewNotificationsPaneTabEnum.Notifications,
    );
  });

  it("ignores persisted watch-code portal visibility because it is session-local", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      { watchCodePortalOpen: true } as Record<string, unknown>,
      current,
    ) as typeof current;

    expect(merged.watchCodePortalOpen).toBe(false);
  });

  it("sanitizes malformed persisted custom slash command shapes deeply", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      {
        customProjectChatSlashCommandsByProjectConfigId: {
          "project-a": [
            1,
            { command: 2 },
            { prompt: [] },
            { command: " ", prompt: "x" },
          ],
          "project-b": [
            { command: "/ship", prompt: "  Ship the current release.  " },
            { command: "/trimmed", prompt: "   " },
          ],
          " ": [{ command: "/ignored", prompt: "ignored" }],
        },
      } as Record<string, unknown>,
      current,
    ) as typeof current;

    expect(merged.customProjectChatSlashCommandsByProjectConfigId).toEqual({
      "project-b": [
        {
          command: "/ship",
          prompt: "Ship the current release.",
        },
      ],
    });
  });

  it("ignores persisted project chat aux view mappings because aux view is session-local", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      {
        projectChatAuxViewByProjectConfigId: {
          "project-a": "skills",
        },
      } as Record<string, unknown>,
      current,
    ) as typeof current;

    expect(merged.projectChatAuxViewByProjectConfigId).toEqual({});
  });

  it("falls back to canonical home pane defaults when persisted values are invalid", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      {
        homeWorkspacePaneVis: "yes",
        homeWorkspacePaneWidth: "320",
        homeWorkspacePaneTrueWidth: null,
        homeSelectedProjectPaneVis: 1,
        homeSelectedProjectPaneWidth: "280",
        homeSelectedProjectPaneTrueWidth: {},
      } as Record<string, unknown>,
      current,
    ) as typeof current;

    expect(merged.homeWorkspacePaneVis).toBe(true);
    expect(merged.homeWorkspacePaneWidth).toBe(320);
    expect(merged.homeWorkspacePaneTrueWidth).toBe(320);
    expect(merged.homeSelectedProjectPaneVis).toBe(true);
    expect(merged.homeSelectedProjectPaneWidth).toBe(280);
    expect(merged.homeSelectedProjectPaneTrueWidth).toBe(280);
  });

  it("keeps canonical home pane values when persisted values are valid", () => {
    const merge = useLocalStorage.persist.getOptions().merge;
    const current = useLocalStorage.getState();

    const merged = merge(
      {
        homeWorkspacePaneVis: false,
        homeWorkspacePaneWidth: 410,
        homeWorkspacePaneTrueWidth: 412,
        homeSelectedProjectPaneVis: false,
        homeSelectedProjectPaneWidth: 350,
        homeSelectedProjectPaneTrueWidth: 352,
      } as Record<string, unknown>,
      current,
    ) as typeof current;

    expect(merged.homeWorkspacePaneVis).toBe(false);
    expect(merged.homeWorkspacePaneWidth).toBe(410);
    expect(merged.homeWorkspacePaneTrueWidth).toBe(412);
    expect(merged.homeSelectedProjectPaneVis).toBe(false);
    expect(merged.homeSelectedProjectPaneWidth).toBe(350);
    expect(merged.homeSelectedProjectPaneTrueWidth).toBe(352);
  });
});

describe("setOverviewProjectConfigOrder", () => {
  const memoryStorage = (() => {
    let store = new Map<string, string>();
    return {
      getItem: (name: string) => store.get(name) ?? null,
      setItem: (name: string, value: string) => {
        store.set(name, value);
      },
      removeItem: (name: string) => {
        store.delete(name);
      },
      reset: () => {
        store = new Map<string, string>();
      },
    };
  })();

  beforeEach(() => {
    resetProjectStores();
    memoryStorage.reset();
    useLocalStorage.persist.setOptions({
      storage: {
        getItem: memoryStorage.getItem,
        setItem: memoryStorage.setItem,
        removeItem: memoryStorage.removeItem,
      },
    });
    useLocalStorage.setState({ overviewProjectConfigOrder: [] });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("dedupes overview project-config order while preserving first occurrence", () => {
    setOverviewProjectConfigOrder(["config-a", "config-b", "config-a"]);

    expect(useLocalStorage.getState().overviewProjectConfigOrder).toEqual([
      "config-a",
      "config-b",
    ]);
  });

  it("keeps unique overview project-config ids unchanged", () => {
    setOverviewProjectConfigOrder(["config-b", "config-a"]);

    expect(useLocalStorage.getState().overviewProjectConfigOrder).toEqual([
      "config-b",
      "config-a",
    ]);
  });
});
