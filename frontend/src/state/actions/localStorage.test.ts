import { useLocalStorage } from "state/definitions";
import { beforeEach, describe, expect, it } from "vitest";
import { setColorModePreference } from "./localStorage";

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
});
