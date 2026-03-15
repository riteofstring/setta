import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getActiveSectionUIIds,
  getActiveSectionUISelectionGeneration,
  sanitizeProjectStateActiveIds,
  setActiveSectionUIIds,
} from "./activeSectionSelection";
import { useActiveSectionUI } from "./storeDefinitions";
import { resetProjectStores } from "./utils";

describe("activeSectionSelection", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("updates active ids, disables backend hydration, and increments generation", () => {
    useActiveSectionUI.setState({
      activeIds: ["section-a"],
      selectionGeneration: 2,
      backendHydrationEnabled: true,
    });

    setActiveSectionUIIds(["section-b"]);

    expect(getActiveSectionUIIds()).toEqual(["section-b"]);
    expect(getActiveSectionUISelectionGeneration()).toBe(3);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(false);
  });

  it("does not mutate the store when the active ids already match", () => {
    useActiveSectionUI.setState({
      activeIds: ["section-a"],
      selectionGeneration: 4,
      backendHydrationEnabled: true,
    });

    setActiveSectionUIIds(["section-a"]);

    expect(getActiveSectionUIIds()).toEqual(["section-a"]);
    expect(getActiveSectionUISelectionGeneration()).toBe(4);
    expect(useActiveSectionUI.getState().backendHydrationEnabled).toBe(true);
  });

  it("clears persisted active ids from project snapshots", () => {
    const sanitized = sanitizeProjectStateActiveIds({
      projectConfig: {
        activeIds: ["section-a"],
      },
      marker: "keep",
    });

    expect(sanitized).toEqual({
      projectConfig: {
        activeIds: [],
      },
      marker: "keep",
    });
  });

  it("leaves project snapshots untouched when persisted active ids are empty", () => {
    const projectState = {
      projectConfig: {
        activeIds: [],
      },
      marker: "keep",
    };

    expect(sanitizeProjectStateActiveIds(projectState)).toBe(projectState);
  });
});
