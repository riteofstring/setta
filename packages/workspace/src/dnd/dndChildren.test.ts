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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost.js";
import {
  addDndChild,
  removeDndChild,
  replaceDndSectionsWithTemp,
  updateDndChildren,
  getDndChildrenStore,
} from "./dndChildren.js";
import { getDndSectionId } from "./dndIds.js";

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
    updateDndChildren(host, {
      parentA: ["child1", "child2"],
    });

    removeDndChild(host, "child1");

    const state = getDndChildrenStore(host).getState();
    expect(state.x.parentA).toEqual(["child2"]);
    expect(state.y.child1).toBeUndefined();
  });

  it("replaces dragged sections with a temporary placeholder", () => {
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
