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
import { useNodeInternals, useWorkspaceDocument } from "../document/stores.js";
import type { Node, WorkspaceSection } from "../document/types.js";
import {
  commitTopLevelLayoutToDocument,
  raiseTempZIndex,
  updateNodeDimensionsFromXyflow,
  updateNodePositions,
} from "./nodeInternalsActions.js";

function createSection(
  id: string,
  children: Array<string> = [],
): WorkspaceSection {
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
    children,
  };
}

function createNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  return {
    id: overrides.id,
    position: overrides.position ?? { x: 0, y: 0 },
    width: overrides.width === undefined ? 100 : overrides.width,
    height: overrides.height === undefined ? 80 : overrides.height,
    zIndex: overrides.zIndex ?? 0,
    tempZIndex: overrides.tempZIndex ?? 0,
    kind: overrides.kind ?? "leaf",
    style: overrides.style,
  };
}

beforeEach(() => {
  testWorkspace.document.getState().reset();
  testWorkspace.nodeInternals.getState().reset();
});

afterEach(() => {});

describe("node-internals publication", () => {
  it("publishes a moved node without replacing untouched node records", () => {
    const moving = createNode({ id: "moving", position: { x: 10, y: 20 } });
    const untouched = createNode({
      id: "untouched",
      position: { x: 100, y: 200 },
    });
    const nextPosition = { x: 35, y: 45 };
    testWorkspace.nodeInternals.setState({
      x: new Map([
        [moving.id, moving],
        [untouched.id, untouched],
      ]),
    });

    updateNodePositions(testWorkspace.host, [
      {
        id: moving.id,
        position: nextPosition,
        distance: { x: 0, y: 0 },
      },
    ]);

    const nextNodes = testWorkspace.nodeInternals.getState().x;
    expect(nextNodes.get(moving.id)).not.toBe(moving);
    expect(nextNodes.get(moving.id)?.position).toBe(nextPosition);
    expect(nextNodes.get(untouched.id)).toBe(untouched);
  });

  it("changes identities only where the temporary z-order value changes", () => {
    const moving = createNode({ id: "moving", zIndex: 2, tempZIndex: 2 });
    const untouched = createNode({ id: "untouched", zIndex: 3, tempZIndex: 3 });
    const stale = createNode({ id: "stale", zIndex: 4, tempZIndex: 1004 });
    testWorkspace.nodeInternals.setState({
      x: new Map([
        [moving.id, moving],
        [untouched.id, untouched],
        [stale.id, stale],
      ]),
    });

    raiseTempZIndex(testWorkspace.host, [{ id: moving.id }]);

    const nextNodes = testWorkspace.nodeInternals.getState().x;
    expect(nextNodes.get(moving.id)).toMatchObject({ tempZIndex: 1002 });
    expect(nextNodes.get(moving.id)).not.toBe(moving);
    expect(nextNodes.get(untouched.id)).toBe(untouched);
    expect(nextNodes.get(stale.id)).toMatchObject({ tempZIndex: 4 });
    expect(nextNodes.get(stale.id)).not.toBe(stale);
  });

  it("publishes changed XYFlow measurements once without a position-frame write", () => {
    const node = createNode({ id: "top", width: 100, height: 80 });
    testWorkspace.document.setState({
      sections: { top: createSection("top") },
      topLevelSections: { top: { x: 0, y: 0, w: 100, h: 80, zIndex: 0 } },
    });
    testWorkspace.nodeInternals.setState({ x: new Map([[node.id, node]]) });
    let notifications = 0;
    testWorkspace.host.subscribe(() => {
      notifications += 1;
    });

    updateNodeDimensionsFromXyflow(testWorkspace.host, [
      { id: node.id, width: 120, height: 90 },
    ]);

    expect(testWorkspace.nodeInternals.getState().x.get(node.id)).toMatchObject(
      {
        width: 120,
        height: 90,
      },
    );
    expect(notifications).toBe(1);

    updateNodeDimensionsFromXyflow(testWorkspace.host, [
      { id: node.id, width: 120, height: 90 },
    ]);

    expect(notifications).toBe(1);
  });
});

describe("commitTopLevelLayoutToDocument", () => {
  it("purges layout entries for parented and unknown sections at the layout write", () => {
    testWorkspace.document.setState({
      sections: {
        top: createSection("top"),
        group: createSection("group", ["child"]),
        child: createSection("child"),
      },
      parentSectionMap: { child: "group" },
      topLevelSections: {
        top: { x: 1, y: 2, w: 50, h: 60, zIndex: 0 },
        child: { x: 9, y: 9, w: 99, h: 99, zIndex: 3 },
        ghost: { x: 0, y: 0, w: 10, h: 10, zIndex: 1 },
      },
    });
    testWorkspace.nodeInternals.setState({
      x: new Map([
        ["top", createNode({ id: "top", position: { x: 5, y: 6 }, zIndex: 1 })],
        [
          "group",
          createNode({ id: "group", position: { x: 200, y: 20 }, zIndex: 2 }),
        ],
      ]),
    });

    commitTopLevelLayoutToDocument(testWorkspace.host);

    expect(testWorkspace.document.getState().topLevelSections).toEqual({
      top: { x: 5, y: 6, w: 100, h: 80, zIndex: 1 },
      group: { x: 200, y: 20, w: 100, h: 80, zIndex: 2 },
    });
  });

  it("writes node measurements verbatim, clearing a null measurement back to auto", () => {
    testWorkspace.document.setState({
      sections: { top: createSection("top") },
      topLevelSections: { top: { x: 1, y: 2, w: 200, h: 100, zIndex: 0 } },
    });
    testWorkspace.nodeInternals.setState({
      x: new Map([
        [
          "top",
          createNode({
            id: "top",
            position: { x: 1, y: 2 },
            width: null,
            height: null,
          }),
        ],
      ]),
    });

    commitTopLevelLayoutToDocument(testWorkspace.host);

    expect(testWorkspace.document.getState().topLevelSections).toEqual({
      top: { x: 1, y: 2, w: null, h: null, zIndex: 0 },
    });
  });

  it("notifies the document-change callback once per layout commit", () => {
    testWorkspace.document.setState({
      sections: { top: createSection("top") },
      topLevelSections: { top: { x: 1, y: 2, w: 200, h: 100, zIndex: 0 } },
    });
    testWorkspace.nodeInternals.setState({
      x: new Map([
        ["top", createNode({ id: "top", position: { x: 5, y: 6 } })],
      ]),
    });
    let notified = 0;
    testWorkspace.host.subscribe(() => {
      notified += 1;
    });

    commitTopLevelLayoutToDocument(testWorkspace.host);

    expect(notified).toBe(1);
  });

  it("does not publish or notify when node geometry already matches the document", () => {
    const layout = { x: 5, y: 6, w: 100, h: 80, zIndex: 1 };
    testWorkspace.document.setState({
      sections: { top: createSection("top") },
      topLevelSections: { top: layout },
    });
    testWorkspace.nodeInternals.setState({
      x: new Map([
        [
          "top",
          createNode({
            id: "top",
            position: { x: 5, y: 6 },
            zIndex: 1,
            tempZIndex: 1,
          }),
        ],
      ]),
    });
    const before = testWorkspace.document.getState().topLevelSections;
    let notified = 0;
    testWorkspace.host.subscribe(() => {
      notified += 1;
    });

    commitTopLevelLayoutToDocument(testWorkspace.host);

    expect(testWorkspace.document.getState().topLevelSections).toBe(before);
    expect(notified).toBe(0);
  });
});
