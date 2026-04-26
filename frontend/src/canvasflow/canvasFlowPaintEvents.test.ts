/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  getCanvasFlowChangedNodeElements,
  getCanvasFlowChangedNodeIds,
} from "./canvasFlowPaintEvents";

describe("canvasFlowPaintEvents", () => {
  it("maps changed descendants back to their node wrapper", () => {
    const node = document.createElement("div");
    const child = document.createElement("button");
    node.dataset.id = "node-a";
    node.append(child);

    const changedNodeIds = getCanvasFlowChangedNodeIds({
      changedElements: [child],
    } as unknown as Event);

    expect(changedNodeIds).toEqual(new Set(["node-a"]));
  });

  it("tracks direct wrapper changes separately from descendant changes", () => {
    const node = document.createElement("div");
    node.dataset.id = "node-a";

    const changed = getCanvasFlowChangedNodeElements({
      changedElements: [node],
    } as unknown as Event);

    expect(changed?.nodeIds).toEqual(new Set(["node-a"]));
    expect(changed?.directNodeIds).toEqual(new Set(["node-a"]));
    expect(changed?.descendantNodeIds).toEqual(new Set());
  });
});
