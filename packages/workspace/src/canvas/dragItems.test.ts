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
import { setActiveSectionIds } from "../document/activeSections.js";
import { useActiveSections } from "../document/stores.js";
import type { Node } from "../document/types.js";
import { getDragItems } from "./dragItems.js";

function createNode(id: string, x: number, y: number): Node {
  return {
    id,
    position: { x, y },
    width: 100,
    height: 80,
    zIndex: 0,
    tempZIndex: 0,
    kind: "leaf",
  };
}

beforeEach(() => {
  testWorkspace.activeSections.getState().reset();
});

describe("getDragItems", () => {
  it("groups the whole active selection when the grabbed node is active", () => {
    const nodeInternals = new Map([
      ["section-a", createNode("section-a", 10, 20)],
      ["section-b", createNode("section-b", 160, 40)],
    ]);

    setActiveSectionIds(testWorkspace.host, ["section-a", "section-b"]);

    const dragItems = getDragItems(
      testWorkspace.host,
      nodeInternals,
      { x: 200, y: 120 },
      "section-a",
    );

    expect(dragItems.map((item) => item.id)).toEqual([
      "section-a",
      "section-b",
    ]);
    expect(dragItems[0]?.distance).toEqual({ x: 190, y: 100 });
  });

  it("still drags only the grabbed node when that node is not in the active set", () => {
    const nodeInternals = new Map([
      ["section-a", createNode("section-a", 10, 20)],
      ["section-b", createNode("section-b", 160, 40)],
    ]);

    setActiveSectionIds(testWorkspace.host, ["section-b"]);

    const dragItems = getDragItems(
      testWorkspace.host,
      nodeInternals,
      { x: 40, y: 40 },
      "section-a",
    );

    expect(dragItems.map((item) => item.id)).toEqual(["section-a"]);
  });

  it("drags the whole active selection when no node id is given", () => {
    const nodeInternals = new Map([
      ["section-a", createNode("section-a", 10, 20)],
      ["section-b", createNode("section-b", 160, 40)],
    ]);

    setActiveSectionIds(testWorkspace.host, ["section-b"]);

    const dragItems = getDragItems(testWorkspace.host, nodeInternals, {
      x: 40,
      y: 40,
    });

    expect(dragItems.map((item) => item.id)).toEqual(["section-b"]);
  });
});
