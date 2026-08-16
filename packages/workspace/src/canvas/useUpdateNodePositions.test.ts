import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useActiveSections, useNodeInternals } from "../document/stores";
import type { Node } from "../document/types";
import { useWorkspaceOptions } from "./options";
import { initialCanvasState, useReactFlow } from "./store";
import { updatePositions } from "./useUpdateNodePositions";

function createNode(): Node {
  return {
    id: "leaf",
    position: { x: 10, y: 20 },
    width: 200,
    height: 100,
    zIndex: 0,
    tempZIndex: 0,
    kind: "leaf",
  };
}

describe("updatePositions", () => {
  beforeEach(() => {
    useNodeInternals.setState({ x: new Map([["leaf", createNode()]]) });
    useActiveSections.setState({ activeIds: ["leaf"] });
    useWorkspaceOptions.setState({ snapToGrid: false });
    useReactFlow.setState({ ...initialCanvasState });
  });

  afterEach(() => {
    useWorkspaceCapabilities.getState().reset();
    useWorkspaceOptions.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  it("blocks selected-section keyboard movement without layout capability", () => {
    useWorkspaceCapabilities.setState({ canEditLayout: false });

    updatePositions({ x: 1, y: 0, isShiftPressed: false });

    expect(useNodeInternals.getState().x.get("leaf")?.position).toEqual({
      x: 10,
      y: 20,
    });

    useWorkspaceCapabilities.setState({ canEditLayout: true });
    updatePositions({ x: 1, y: 0, isShiftPressed: false });

    expect(useNodeInternals.getState().x.get("leaf")?.position).toEqual({
      x: 15,
      y: 20,
    });
  });
});
