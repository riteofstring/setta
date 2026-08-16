import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});

import { beforeEach, describe, expect, it } from "vitest";
import { setZIndices } from "./sectionZIndices";
import { useNodeInternals } from "./stores";
import type { Node } from "./types";

function makeNode(id: string, zIndex: number): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    zIndex,
    tempZIndex: zIndex,
    kind: "leaf",
  };
}

function setNodes(nodes: Array<Node>) {
  testWorkspace.nodeInternals.setState({
    x: new Map(nodes.map((node) => [node.id, node])),
  });
}

function zIndexById(): Record<string, { zIndex: number; tempZIndex: number }> {
  const result: Record<string, { zIndex: number; tempZIndex: number }> = {};
  for (const node of testWorkspace.nodeInternals.getState().x.values()) {
    result[node.id] = { zIndex: node.zIndex, tempZIndex: node.tempZIndex };
  }
  return result;
}

describe("setZIndices", () => {
  beforeEach(() => {
    testWorkspace.nodeInternals.getState().reset();
  });

  it("raises the targets above the current maximum", () => {
    setNodes([makeNode("a", 0), makeNode("b", 1), makeNode("c", 2)]);
    setZIndices(testWorkspace.host, ["a"]);
    expect(zIndexById()).toEqual({
      a: { zIndex: 3, tempZIndex: 3 },
      b: { zIndex: 1, tempZIndex: 1 },
      c: { zIndex: 2, tempZIndex: 2 },
    });
  });

  it("ignores unknown targets and leaves the map untouched when nothing changes", () => {
    setNodes([makeNode("a", 0), makeNode("b", 1)]);
    const before = testWorkspace.nodeInternals.getState().x;
    setZIndices(testWorkspace.host, ["ghost"]);
    expect(testWorkspace.nodeInternals.getState().x).toBe(before);
  });

  it("always normalizes when the drag-end flag is set, below the raise threshold", () => {
    setNodes([makeNode("a", 3), makeNode("b", 1), makeNode("c", 2)]);
    setZIndices(testWorkspace.host, ["b"], true);
    expect(zIndexById()).toEqual({
      c: { zIndex: 0, tempZIndex: 0 },
      a: { zIndex: 1, tempZIndex: 1 },
      b: { zIndex: 2, tempZIndex: 2 },
    });
  });

  it("normalizes dense z-indices once the maximum exceeds four times the node count", () => {
    setNodes([makeNode("a", 100), makeNode("b", 7), makeNode("c", 42)]);
    setZIndices(testWorkspace.host, ["a"]);
    expect(zIndexById()).toEqual({
      b: { zIndex: 0, tempZIndex: 0 },
      c: { zIndex: 1, tempZIndex: 1 },
      a: { zIndex: 2, tempZIndex: 2 },
    });
  });

  it("keeps input-position gaps for missing targets during normalization", () => {
    setNodes([makeNode("a", 100), makeNode("b", 7)]);
    setZIndices(testWorkspace.host, ["ghost", "a"]);
    expect(zIndexById()).toEqual({
      b: { zIndex: 0, tempZIndex: 0 },
      a: { zIndex: 2, tempZIndex: 2 },
    });
  });
});
