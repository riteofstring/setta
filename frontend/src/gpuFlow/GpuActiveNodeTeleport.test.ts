/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import type { GpuActiveNodeSnapshot } from "./GpuActiveNodeSnapshot";
import { createGpuActiveNodeTeleportController } from "./GpuActiveNodeTeleport";

describe("GpuActiveNodeTeleport", () => {
  it("moves the source node into the active layer and restores its original DOM position", () => {
    const canvas = document.createElement("canvas");
    const before = document.createElement("div");
    const node = document.createElement("div");
    const after = document.createElement("div");
    const layer = document.createElement("div");
    before.id = "before";
    node.className = "setta-gpu-flow__node";
    node.dataset.id = "node-a";
    after.id = "after";
    canvas.append(before, node, after);
    document.body.append(canvas, layer);
    const controller = createGpuActiveNodeTeleportController(layer);

    const syncResult = controller.sync(snapshot(node, "node-a"));

    expect(syncResult).toEqual({
      restoredNodeId: null,
      teleportedNodeId: "node-a",
    });
    expect(controller.getTeleportedNodeId()).toBe("node-a");
    expect(layer.firstElementChild).toBe(node);
    expect(node.dataset.gpuFlowTeleport).toBe("active");
    expect(node.classList.contains("setta-gpu-flow__node--teleported")).toBe(
      true,
    );
    expect(node.style.height).toBe("50px");
    expect(node.style.transform).toBe("translate(10px, 20px) scale(1.5)");
    expect(node.style.pointerEvents).toBe("all");
    expect(node.style.width).toBe("100px");
    expect(node.style.zIndex).toBe("2");

    expect(controller.sync(null)).toEqual({
      restoredNodeId: "node-a",
      teleportedNodeId: null,
    });

    expect(controller.getTeleportedNodeId()).toBeNull();
    expect([...canvas.children]).toEqual([before, node, after]);
    expect(node.dataset.gpuFlowTeleport).toBeUndefined();
    expect(node.classList.contains("setta-gpu-flow__node--teleported")).toBe(
      false,
    );

    const settlingClone = layer.firstElementChild;
    expect(settlingClone).not.toBeNull();
    expect(settlingClone).not.toBe(node);
    expect(settlingClone?.classList.contains("setta-gpu-flow__node")).toBe(
      true,
    );
    expect(
      settlingClone?.classList.contains("setta-gpu-flow__node--settling-clone"),
    ).toBe(true);
    expect(settlingClone?.getAttribute("aria-hidden")).toBe("true");
    expect(settlingClone?.getAttribute("inert")).toBe("");
    expect(settlingClone?.getAttribute("data-gpu-flow-node")).toBeNull();
    expect((settlingClone as HTMLElement | null)?.style.transform).toBe(
      "translate(10px, 20px) scale(1.5)",
    );

    controller.clearSettlingClone("node-a");

    expect(layer.childElementCount).toBe(0);
  });

  it("restores inline presentation styles that only belong to the active overlay", () => {
    const canvas = document.createElement("canvas");
    const node = document.createElement("div");
    const layer = document.createElement("div");
    node.style.height = "75px";
    node.style.transform = "translate(1px, 2px) scale(1)";
    node.style.width = "125px";
    node.style.zIndex = "4";
    canvas.append(node);
    document.body.append(canvas, layer);
    const controller = createGpuActiveNodeTeleportController(layer);

    controller.sync(snapshot(node, "node-a"));
    expect(node.style.height).toBe("50px");
    expect(node.style.width).toBe("100px");
    expect(node.style.zIndex).toBe("2");

    controller.sync(null);

    expect(node.style.height).toBe("75px");
    expect(node.style.transform).toBe("translate(1px, 2px) scale(1)");
    expect(node.style.width).toBe("125px");
    expect(node.style.zIndex).toBe("4");
  });

  it("restores the previous node before teleporting another one", () => {
    const canvas = document.createElement("canvas");
    const first = document.createElement("div");
    const second = document.createElement("div");
    const layer = document.createElement("div");
    canvas.append(first, second);
    document.body.append(canvas, layer);
    const controller = createGpuActiveNodeTeleportController(layer);

    controller.sync(snapshot(first, "first"));
    expect(controller.sync(snapshot(second, "second"))).toEqual({
      restoredNodeId: "first",
      teleportedNodeId: "second",
    });

    expect(layer.lastElementChild).toBe(second);
    const firstClone = layer.firstElementChild;
    expect(firstClone).not.toBe(first);
    expect(firstClone?.getAttribute("data-gpu-flow-teleport")).toBe(
      "settling-clone",
    );
    expect([...canvas.children]).toEqual([first]);
    expect(first.dataset.gpuFlowTeleport).toBeUndefined();

    controller.destroy();

    expect([...canvas.children]).toEqual([first, second]);
    expect(layer.childElementCount).toBe(0);
  });

  it("preserves scroll offsets on settling clones", () => {
    const canvas = document.createElement("canvas");
    const node = document.createElement("div");
    const scroller = document.createElement("div");
    const nestedScroller = document.createElement("div");
    const layer = document.createElement("div");
    scroller.className = "scroller";
    nestedScroller.className = "nested-scroller";
    scroller.scrollLeft = 12;
    scroller.scrollTop = 96;
    nestedScroller.scrollTop = 24;
    scroller.append(nestedScroller);
    node.append(scroller);
    canvas.append(node);
    document.body.append(canvas, layer);
    const controller = createGpuActiveNodeTeleportController(layer);

    controller.sync(snapshot(node, "node-a"));
    controller.sync(null);

    const cloneScroller = layer.querySelector<HTMLElement>(".scroller");
    const cloneNestedScroller =
      layer.querySelector<HTMLElement>(".nested-scroller");
    expect(cloneScroller?.scrollLeft).toBe(12);
    expect(cloneScroller?.scrollTop).toBe(96);
    expect(cloneNestedScroller?.scrollTop).toBe(24);
    expect(scroller.scrollLeft).toBe(12);
    expect(scroller.scrollTop).toBe(96);
    expect(nestedScroller.scrollTop).toBe(24);
  });

  it("preserves focused input selection while moving the node", () => {
    const canvas = document.createElement("canvas");
    const node = document.createElement("div");
    const input = document.createElement("input");
    const layer = document.createElement("div");
    input.value = "strategy-a2";
    node.append(input);
    canvas.append(node);
    document.body.append(canvas, layer);
    const controller = createGpuActiveNodeTeleportController(layer);

    input.focus();
    input.setSelectionRange(3, 8, "forward");
    controller.sync(snapshot(node, "node-a"));

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(8);

    controller.sync(null);

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(8);
  });

  it("preserves focused contenteditable selection while moving the node", () => {
    const canvas = document.createElement("canvas");
    const node = document.createElement("div");
    const editor = document.createElement("div");
    const text = document.createTextNode("return strategy");
    const layer = document.createElement("div");
    editor.contentEditable = "true";
    editor.tabIndex = 0;
    editor.append(text);
    node.append(editor);
    canvas.append(node);
    document.body.append(canvas, layer);
    const controller = createGpuActiveNodeTeleportController(layer);

    editor.focus();
    setDocumentSelection(text, 7, text, 15);
    controller.sync(snapshot(node, "node-a"));

    expect(document.activeElement).toBe(editor);
    expect(document.getSelection()?.anchorNode).toBe(text);
    expect(document.getSelection()?.anchorOffset).toBe(7);
    expect(document.getSelection()?.focusNode).toBe(text);
    expect(document.getSelection()?.focusOffset).toBe(15);

    controller.sync(null);

    expect(document.activeElement).toBe(editor);
    expect(document.getSelection()?.anchorNode).toBe(text);
    expect(document.getSelection()?.anchorOffset).toBe(7);
    expect(document.getSelection()?.focusNode).toBe(text);
    expect(document.getSelection()?.focusOffset).toBe(15);
  });
});

function snapshot(
  sourceElement: HTMLElement,
  nodeId: string,
): GpuActiveNodeSnapshot {
  return {
    frame: 1,
    height: 50,
    nodeId,
    screenX: 10,
    screenY: 20,
    sourceElement,
    width: 100,
    zIndex: 2,
    zoom: 1.5,
  };
}

function setDocumentSelection(
  anchorNode: Node,
  anchorOffset: number,
  focusNode: Node,
  focusOffset: number,
) {
  const selection = document.getSelection();
  if (!selection) {
    throw new Error("Expected document selection support.");
  }
  selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
}
