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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIEvent } from "react";
import type { Node, WorkspaceSection } from "../document/types.js";
import {
  cancelWorkspaceCanvasScrolling,
  commitWorkspaceXyflowNodeDrag,
} from "./WorkspaceCanvas.js";
import type { NodeDragItem } from "./types.js";
import { registerWorkspaceXyflowInstance } from "./xyflow/workspaceXyflowRuntime.js";
import type { WorkspaceXyflowInstance } from "./xyflow/types.js";

function createSection(id: string): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: "auto", height: "auto" },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

function createNode(
  id: string,
  position: { x: number; y: number },
  zIndex: number,
): Node {
  return {
    id,
    position,
    width: 200,
    height: 100,
    zIndex,
    tempZIndex: zIndex,
    kind: "leaf",
  };
}

function createDragItem(
  id: string,
  position: { x: number; y: number },
): NodeDragItem {
  return {
    id,
    position,
    distance: { x: 0, y: 0 },
  };
}

beforeEach(() => {
  testWorkspace.document.getState().reset();
  testWorkspace.nodeInternals.getState().reset();
  testWorkspace.options.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorkspaceCanvas XYFlow bridges", () => {
  it("commits a multi-node drag and normalized z-order in one publication", () => {
    const first = createNode("first", { x: 10, y: 20 }, 0);
    const second = createNode("second", { x: 40, y: 60 }, 1);
    const untouched = createNode("untouched", { x: 100, y: 120 }, 2);
    testWorkspace.document.setState({
      sections: {
        first: createSection("first"),
        second: createSection("second"),
        untouched: createSection("untouched"),
      },
      topLevelSections: {
        first: { x: 10, y: 20, w: 200, h: 100, zIndex: 0 },
        second: { x: 40, y: 60, w: 200, h: 100, zIndex: 1 },
        untouched: { x: 100, y: 120, w: 200, h: 100, zIndex: 2 },
      },
    });
    testWorkspace.nodeInternals.setState({
      x: new Map([
        [first.id, first],
        [second.id, second],
        [untouched.id, untouched],
      ]),
    });
    testWorkspace.options.setState({ snapToGrid: false });
    let publications = 0;
    testWorkspace.host.subscribe(() => {
      publications += 1;
    });

    commitWorkspaceXyflowNodeDrag(testWorkspace.host, [
      createDragItem(first.id, { x: 25, y: 32 }),
      createDragItem(second.id, { x: 55, y: 72 }),
    ]);

    const nodes = testWorkspace.nodeInternals.getState().x;
    expect(nodes.get(first.id)).toMatchObject({
      position: { x: 25, y: 32 },
      zIndex: 1,
      tempZIndex: 1,
    });
    expect(nodes.get(second.id)).toMatchObject({
      position: { x: 55, y: 72 },
      zIndex: 2,
      tempZIndex: 2,
    });
    expect(nodes.get(untouched.id)).toMatchObject({ zIndex: 0, tempZIndex: 0 });
    expect(publications).toBe(1);

    commitWorkspaceXyflowNodeDrag(testWorkspace.host, [
      createDragItem(first.id, { x: 25, y: 32 }),
      createDragItem(second.id, { x: 55, y: 72 }),
    ]);

    expect(publications).toBe(1);
  });

  it("cancels outer-shell scrolling through the public XYFlow viewport", () => {
    const setViewport = vi.fn(() => Promise.resolve(true));
    const instance = {
      getViewport: () => ({ x: 100, y: 200, zoom: 2 }),
      setViewport,
      zoomTo: vi.fn(() => Promise.resolve(true)),
      screenToFlowPosition: vi.fn(),
    } as unknown as WorkspaceXyflowInstance;
    registerWorkspaceXyflowInstance(testWorkspace.host, instance);
    const target = { scrollLeft: 5_024, scrollTop: 4_960 } as HTMLDivElement;

    cancelWorkspaceCanvasScrolling(
      testWorkspace.host,
      { currentTarget: target } as unknown as UIEvent<HTMLDivElement>,
      true,
    );

    expect(setViewport).toHaveBeenCalledWith({ x: 76, y: 240, zoom: 2 });
    expect(target.scrollLeft).toBe(5_000);
    expect(target.scrollTop).toBe(5_000);
  });
});
