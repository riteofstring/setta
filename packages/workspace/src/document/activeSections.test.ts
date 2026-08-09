import { beforeEach, describe, expect, it } from "vitest";
import { getActiveSectionIds, setActiveSectionIds } from "./activeSections";
import { useActiveSections } from "./stores";

describe("setActiveSectionIds", () => {
  beforeEach(() => {
    useActiveSections.getState().reset();
  });

  it("updates the active ids", () => {
    setActiveSectionIds(["a", "b"]);
    expect(getActiveSectionIds()).toEqual(["a", "b"]);
  });

  it("does not publish when the ids are deep-equal to the current ones", () => {
    setActiveSectionIds(["a"]);
    const before = useActiveSections.getState();
    setActiveSectionIds(["a"]);
    expect(useActiveSections.getState()).toBe(before);
  });
});
