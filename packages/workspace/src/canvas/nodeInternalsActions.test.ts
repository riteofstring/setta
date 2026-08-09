import { beforeEach, describe, expect, it } from "vitest";
import { useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { Node, WorkspaceSection } from "../document/types";
import { commitTopLevelLayoutToDocument } from "./nodeInternalsActions";

function createSection(id: string, children: Array<string> = []): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: "auto", height: "auto" },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
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
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
});

describe("commitTopLevelLayoutToDocument", () => {
  it("purges layout entries for parented and unknown sections at the layout write", () => {
    useWorkspaceDocument.setState({
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
    useNodeInternals.setState({
      x: new Map([
        ["top", createNode({ id: "top", position: { x: 5, y: 6 }, zIndex: 1 })],
        ["group", createNode({ id: "group", position: { x: 200, y: 20 }, zIndex: 2 })],
      ]),
    });

    commitTopLevelLayoutToDocument();

    expect(useWorkspaceDocument.getState().topLevelSections).toEqual({
      top: { x: 5, y: 6, w: 100, h: 80, zIndex: 1 },
      group: { x: 200, y: 20, w: 100, h: 80, zIndex: 2 },
    });
  });

  it("writes node measurements verbatim, clearing a null measurement back to auto", () => {
    useWorkspaceDocument.setState({
      sections: { top: createSection("top") },
      topLevelSections: { top: { x: 1, y: 2, w: 200, h: 100, zIndex: 0 } },
    });
    useNodeInternals.setState({
      x: new Map([
        ["top", createNode({ id: "top", position: { x: 1, y: 2 }, width: null, height: null })],
      ]),
    });

    commitTopLevelLayoutToDocument();

    expect(useWorkspaceDocument.getState().topLevelSections).toEqual({
      top: { x: 1, y: 2, w: null, h: null, zIndex: 0 },
    });
  });
});
