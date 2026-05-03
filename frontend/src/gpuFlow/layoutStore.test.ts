import { describe, expect, it } from "vitest";

import {
  createGpuFlowLayoutStore,
  getGpuFlowLayoutNodeRect,
  type GpuFlowLayoutNode,
} from "./layoutStore";

describe("GpuFlow layout store", () => {
  it("keeps renderer-owned node order and exposes z-ordered queries", () => {
    const store = createGpuFlowLayoutStore({
      nodes: [
        layoutNode("base", { zIndex: 1 }),
        layoutNode("raised", { tempZIndex: 20, zIndex: 2 }),
        layoutNode("peer", { zIndex: 1 }),
      ],
    });

    expect(store.getState().version).toBe(0);
    expect(store.getState().dirty).toEqual([]);
    expect(
      store
        .getState()
        .getNodes()
        .map((node) => node.nodeId),
    ).toEqual(["base", "raised", "peer"]);
    expect(
      store
        .getState()
        .getZOrderedNodes()
        .map((node) => node.nodeId),
    ).toEqual(["base", "peer", "raised"]);
  });

  it("records one batched change with changed nodes and dirty dependencies", () => {
    const store = createGpuFlowLayoutStore({
      nodes: [
        layoutNode("a", { height: 40, width: 50, x: 10, y: 20 }),
        layoutNode("b", { height: 40, width: 50, x: 80, y: 20 }),
      ],
    });

    const change = store.getState().patchNodes(
      [
        { nodeId: "a", x: 15, y: 25 },
        { nodeId: "b", width: 75 },
      ],
      { phase: "change", reason: "drag" },
    );

    expect(store.getState().version).toBe(1);
    expect(change).toMatchObject({
      changedNodeIds: ["a", "b"],
      dirty: [
        "node-geometry",
        "edge-geometry",
        "selection-bounds",
        "visible-set",
        "texture-size",
      ],
      phase: "change",
      reason: "drag",
    });
    expect(change.previousNodes.map((node) => node.nodeId)).toEqual(["a", "b"]);
    expect(change.nextNodes).toMatchObject([
      { nodeId: "a", x: 15, y: 25 },
      { nodeId: "b", width: 75 },
    ]);
    expect(store.getState().dirty).toEqual(change.dirty);

    const noOpChange = store
      .getState()
      .patchNodes([{ nodeId: "a", x: 15, y: 25 }]);

    expect(noOpChange.changedNodeIds).toEqual([]);
    expect(noOpChange.dirty).toEqual([]);
    expect(store.getState().version).toBe(1);
  });

  it("supports replace, upsert, remove, and dirty clearing", () => {
    const store = createGpuFlowLayoutStore({
      nodes: [layoutNode("a"), layoutNode("b")],
    });

    const upsertChange = store.getState().upsertNodes(
      [
        layoutNode("b", {
          sourceLocalBounds: { height: 50, width: 70, x: 0, y: 0 },
        }),
        layoutNode("c"),
      ],
      { dirty: ["source-size"], reason: "project-sync" },
    );

    expect(upsertChange.changedNodeIds).toEqual(["b", "c"]);
    expect(
      store
        .getState()
        .getNodes()
        .map((node) => node.nodeId),
    ).toEqual(["a", "b", "c"]);
    expect(store.getState().dirty).toContain("source-size");

    store.getState().clearDirty(["source-size"]);
    expect(store.getState().dirty).not.toContain("source-size");

    const replaceChange = store
      .getState()
      .replaceNodes([layoutNode("c"), layoutNode("a")], { reason: "load" });

    expect(replaceChange.changedNodeIds).toEqual(["a", "b", "c"]);
    expect(
      store
        .getState()
        .getNodes()
        .map((node) => node.nodeId),
    ).toEqual(["c", "a"]);

    const removeChange = store.getState().removeNodes(["a"]);

    expect(removeChange.changedNodeIds).toEqual(["a"]);
    expect(removeChange.previousNodes.map((node) => node.nodeId)).toEqual([
      "a",
    ]);
    expect(removeChange.nextNodes).toEqual([]);

    store.getState().clearDirty();
    expect(store.getState().dirty).toEqual([]);
  });

  it("stores renderer-owned drag preview markers outside node geometry", () => {
    const store = createGpuFlowLayoutStore({
      nodes: [layoutNode("a"), layoutNode("b")],
    });
    const versions: number[] = [];
    const unsubscribe = store.subscribe((state) => {
      versions.push(state.version);
    });

    store.getState().setDragPreview({
      draggedNodeIds: ["a"],
      dropMarker: {
        axis: "y",
        childNodeId: "a",
        index: 1,
        parentNodeId: "parent",
        rect: { height: 4, width: 120, x: 10, y: 42 },
      },
    });

    expect(store.getState().dragPreview).toEqual({
      draggedNodeIds: ["a"],
      dropMarker: {
        axis: "y",
        childNodeId: "a",
        index: 1,
        parentNodeId: "parent",
        rect: { height: 4, width: 120, x: 10, y: 42 },
      },
    });
    expect(store.getState().version).toBe(0);
    expect(store.getState().lastChange).toBeNull();

    store.getState().setDragPreview({
      draggedNodeIds: ["a"],
      dropMarker: {
        axis: "y",
        childNodeId: "a",
        index: 1,
        parentNodeId: "parent",
        rect: { height: 4, width: 120, x: 10, y: 42 },
      },
    });
    store.getState().setDragPreview(null);

    expect(store.getState().dragPreview).toBeNull();
    expect(versions).toEqual([0, 0]);
    unsubscribe();
  });

  it("queries measured bounds and topmost hit targets without DOM reads", () => {
    const store = createGpuFlowLayoutStore({
      nodes: [
        layoutNode("unmeasured", {
          height: null,
          width: null,
          x: -100,
          y: -100,
        }),
        layoutNode("bottom", { height: 80, width: 80, x: 0, y: 0, zIndex: 1 }),
        layoutNode("top", { height: 40, width: 40, x: 20, y: 20, zIndex: 2 }),
      ],
    });

    expect(store.getState().getNodeRect("unmeasured")).toBeNull();
    const bottomNode = store.getState().getNode("bottom");
    expect(bottomNode).not.toBeNull();
    expect(bottomNode ? getGpuFlowLayoutNodeRect(bottomNode) : null).toEqual({
      height: 80,
      width: 80,
      x: 0,
      y: 0,
    });
    expect(store.getState().getNodesBounds()).toEqual({
      height: 80,
      width: 80,
      x: 0,
      y: 0,
    });
    expect(store.getState().getNodesBounds(["top"])).toEqual({
      height: 40,
      width: 40,
      x: 20,
      y: 20,
    });
    expect(store.getState().getNodeAtPoint({ x: 25, y: 25 })?.nodeId).toEqual(
      "top",
    );
    expect(
      store.getState().getNodeAtPoint({ x: 25, y: 25 }, { nodeIds: ["bottom"] })
        ?.nodeId,
    ).toEqual("bottom");
    expect(store.getState().getNodeAtPoint({ x: 200, y: 200 })).toBeNull();
  });

  it("fails loudly for invalid or ambiguous layout mutations", () => {
    expect(() => createGpuFlowLayoutStore({ nodes: [layoutNode("")] })).toThrow(
      "layout node id is required",
    );

    expect(() =>
      createGpuFlowLayoutStore({
        nodes: [layoutNode("duplicate"), layoutNode("duplicate")],
      }),
    ).toThrow("Duplicate layout node duplicate");

    const store = createGpuFlowLayoutStore({ nodes: [layoutNode("a")] });

    expect(() =>
      store.getState().patchNodes([{ nodeId: "missing", x: 1 }]),
    ).toThrow("Missing layout node missing");
    expect(() =>
      store.getState().upsertNodes([layoutNode("b"), layoutNode("b")]),
    ).toThrow("Duplicate layout node b");
  });
});

function layoutNode(
  nodeId: string,
  overrides: Partial<Omit<GpuFlowLayoutNode, "nodeId">> = {},
): GpuFlowLayoutNode {
  return {
    height: 60,
    nodeId,
    width: 100,
    x: 0,
    y: 0,
    ...overrides,
  };
}
