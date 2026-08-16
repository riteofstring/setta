import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});

import { beforeEach, describe, expect, it } from "vitest";
import { getActiveSectionIds, setActiveSectionIds } from "./activeSections";
import { useActiveSections } from "./stores";

describe("setActiveSectionIds", () => {
  beforeEach(() => {
    testWorkspace.activeSections.getState().reset();
  });

  it("updates the active ids", () => {
    setActiveSectionIds(testWorkspace.host, ["a", "b"]);
    expect(getActiveSectionIds(testWorkspace.host)).toEqual(["a", "b"]);
  });

  it("does not publish when the ids are deep-equal to the current ones", () => {
    setActiveSectionIds(testWorkspace.host, ["a"]);
    const before = testWorkspace.activeSections.getState();
    setActiveSectionIds(testWorkspace.host, ["a"]);
    expect(testWorkspace.activeSections.getState()).toBe(before);
  });
});
