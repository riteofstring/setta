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
import { useWorkspaceCapabilities } from "../document/capabilities.js";
import { useActiveSections, useNodeInternals } from "../document/stores.js";
import type { Node } from "../document/types.js";
import { useWorkspaceOptions } from "./options.js";
import { initialCanvasState, useReactFlow } from "./store.js";
import { updatePositions } from "./useUpdateNodePositions.js";

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
    testWorkspace.nodeInternals.setState({
      x: new Map([["leaf", createNode()]]),
    });
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

    expect(
      testWorkspace.nodeInternals.getState().x.get("leaf")?.position,
    ).toEqual({
      x: 10,
      y: 20,
    });

    testWorkspace.capabilities.setState({ canEditLayout: true });
    updatePositions(testWorkspace.host, { x: 1, y: 0, isShiftPressed: false });

    expect(
      testWorkspace.nodeInternals.getState().x.get("leaf")?.position,
    ).toEqual({
      x: 15,
      y: 20,
    });
  });
});
