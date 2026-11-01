import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSortingOverState,
  getSortingOverState,
  resetSortingOverState,
  setSortingOverState,
} from "./sortingOverState.js";

describe("sortingOverState", () => {
  beforeEach(() => {
    resetSortingOverState(testWorkspace.host);
  });

  it("stores and returns over-state by container", () => {
    setSortingOverState(testWorkspace.host, "container-a", "item-1", true);

    expect(getSortingOverState(testWorkspace.host, "container-a")).toEqual({
      overId: "item-1",
      pastHalfway: true,
    });
  });

  it("clears a single container state", () => {
    setSortingOverState(testWorkspace.host, "container-a", "item-1", true);
    setSortingOverState(testWorkspace.host, "container-b", "item-2", false);

    clearSortingOverState(testWorkspace.host, "container-a");

    expect(getSortingOverState(testWorkspace.host, "container-a")).toBeNull();
    expect(getSortingOverState(testWorkspace.host, "container-b")).toEqual({
      overId: "item-2",
      pastHalfway: false,
    });
  });

  it("resets all container states", () => {
    setSortingOverState(testWorkspace.host, "container-a", "item-1", true);
    setSortingOverState(testWorkspace.host, "container-b", "item-2", false);

    resetSortingOverState(testWorkspace.host);

    expect(getSortingOverState(testWorkspace.host, "container-a")).toBeNull();
    expect(getSortingOverState(testWorkspace.host, "container-b")).toBeNull();
  });
});
