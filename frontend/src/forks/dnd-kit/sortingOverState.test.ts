import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSortingOverState,
  getSortingOverState,
  resetSortingOverState,
  setSortingOverState,
} from "./sortingOverState";

describe("sortingOverState", () => {
  beforeEach(() => {
    resetSortingOverState();
  });

  it("stores and returns over-state by container", () => {
    // Validates per-container storage for sortable over metadata.
    setSortingOverState("container-a", "item-1", true);

    expect(getSortingOverState("container-a")).toEqual({
      overId: "item-1",
      pastHalfway: true,
    });
  });

  it("clears a single container state", () => {
    // Validates container-scoped cleanup without affecting unrelated entries.
    setSortingOverState("container-a", "item-1", true);
    setSortingOverState("container-b", "item-2", false);

    clearSortingOverState("container-a");

    expect(getSortingOverState("container-a")).toBeNull();
    expect(getSortingOverState("container-b")).toEqual({
      overId: "item-2",
      pastHalfway: false,
    });
  });

  it("resets all container states", () => {
    // Validates global cleanup path for drag lifecycle resets.
    setSortingOverState("container-a", "item-1", true);
    setSortingOverState("container-b", "item-2", false);

    resetSortingOverState();

    expect(getSortingOverState("container-a")).toBeNull();
    expect(getSortingOverState("container-b")).toBeNull();
  });
});
