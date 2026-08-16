import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});

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
    testWorkspace.nodeInternals.setState({ x: new Map([["leaf", createNode()]]) });
    testWorkspace.activeSections.setState({ activeIds: ["leaf"] });
    testWorkspace.options.setState({ snapToGrid: false });
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  afterEach(() => {
    testWorkspace.capabilities.getState().reset();
    testWorkspace.options.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  it("blocks selected-section keyboard movement without layout capability", () => {
    testWorkspace.capabilities.setState({ canEditLayout: false });

    updatePositions(testWorkspace.host, { x: 1, y: 0, isShiftPressed: false });

    expect(testWorkspace.nodeInternals.getState().x.get("leaf")?.position).toEqual({
      x: 10,
      y: 20,
    });

    testWorkspace.capabilities.setState({ canEditLayout: true });
    updatePositions(testWorkspace.host, { x: 1, y: 0, isShiftPressed: false });

    expect(testWorkspace.nodeInternals.getState().x.get("leaf")?.position).toEqual({
      x: 15,
      y: 20,
    });
  });
});
