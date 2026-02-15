import { useLocalStorage } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { OverviewTabNameEnum } from "utils/constants";
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
