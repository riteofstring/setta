import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import {
  addDndChild,
  removeDndChild,
  replaceDndSectionsWithTemp,
  updateDndChildren,
  getDndChildrenStore,
} from "./dndChildren";
import { getDndSectionId } from "./dndIds";

describe("dndChildren state", () => {
  let host: WorkspaceHost;

  beforeEach(() => {
    host = createWorkspaceHost();
    getDndChildrenStore(host).getState().reset();
  });

  afterEach(() => {
    host.dispose();
  });

  it("builds parent and reverse-child maps from section children", () => {
    // Validates map hydration from canonical parent->children input.
    updateDndChildren(host, {
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });

    const state = getDndChildrenStore(host).getState();
    expect(state.x).toEqual({
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });
    expect(state.y).toEqual({
      child1: "parentA",
      child2: "parentA",
      child3: "parentB",
    });
  });

  it("moves a child between parents at a specific index", () => {
    // Validates add operation performs remove + indexed insert + reverse map update.
    updateDndChildren(host, {
      parentA: ["child1", "child2"],
      parentB: ["child3"],
    });

    addDndChild(host, "parentA", "parentB", "child1", 1);

    const state = getDndChildrenStore(host).getState();
    expect(state.x.parentA).toEqual(["child2"]);
    expect(state.x.parentB).toEqual(["child3", "child1"]);
    expect(state.y.child1).toBe("parentB");
  });

  it("removes a child from its current parent", () => {
    // Validates removal updates both parent children and reverse map.
    updateDndChildren(host, {
      parentA: ["child1", "child2"],
    });

    removeDndChild(host, "child1");

    const state = getDndChildrenStore(host).getState();
    expect(state.x.parentA).toEqual(["child2"]);
    expect(state.y.child1).toBeUndefined();
  });

  it("replaces dragged sections with a temporary placeholder", () => {
    // Validates grouped drag placeholder insertion and stale temp cleanup.
    const staleTempId = getDndSectionId("stale");
    updateDndChildren(host, {
      parentA: ["a", "b", "c"],
      parentB: [staleTempId],
    });

    replaceDndSectionsWithTemp(host, "active", ["b", "c"]);

    const tempId = getDndSectionId("active");
    const state = getDndChildrenStore(host).getState();
    expect(state.x.parentA).toEqual(["a", tempId]);
    expect(state.x.parentB).toEqual([]);
    expect(state.y[tempId]).toBe("parentA");
    expect(state.y.b).toBeUndefined();
    expect(state.y.c).toBeUndefined();
    expect(state.y[staleTempId]).toBeUndefined();
  });
});
