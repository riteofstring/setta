import { describe, expect, test } from "vitest";

import { createPaddedViewportNodeSet } from "./pixi-renderer-visibility-window";

describe("padded viewport node visibility window", () => {
  test("retains nodes inside the exit padding and reports enter/exit deltas", () => {
    const node = { id: "node_a" };
    const nodesById = new Map([[node.id, node]]);
    const queryResults = [[node], [], [node], [], []];
    const spatialQueries = {
      nodesInPaddedViewport: () => queryResults.shift() ?? [],
    };
    const window = createPaddedViewportNodeSet({
      enterPaddingScreenPx: 10,
      exitPaddingScreenPx: 20,
      getNode: (nodeId) => nodesById.get(nodeId),
      queryKind: "test-visibility",
      spatialQueries,
    });

    const initial = window.sync();
    expect([...initial.visibleNodeIds]).toEqual(["node_a"]);
    expect([...initial.enteredNodeIds]).toEqual(["node_a"]);
    expect([...initial.exitedNodeIds]).toEqual([]);
    expect(initial.changed).toBe(true);

    const retained = window.sync();
    expect([...retained.visibleNodeIds]).toEqual(["node_a"]);
    expect([...retained.enteredNodeIds]).toEqual([]);
    expect([...retained.exitedNodeIds]).toEqual([]);
    expect(retained.changed).toBe(false);

    const exited = window.sync();
    expect([...exited.visibleNodeIds]).toEqual([]);
    expect([...exited.enteredNodeIds]).toEqual([]);
    expect([...exited.exitedNodeIds]).toEqual(["node_a"]);
    expect(exited.exitedNodes).toEqual([node]);
    expect(exited.changed).toBe(true);
  });
});
