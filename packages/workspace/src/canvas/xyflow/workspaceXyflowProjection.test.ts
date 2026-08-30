import { describe, expect, it } from "vitest";
import type { Node as WorkspaceNode } from "../../document/types";
import { NO_PAN_CLASS_NAME } from "../../interaction";
import { projectWorkspaceNodesToXyflow } from "./workspaceXyflowProjection";

function createWorkspaceNode(
  overrides: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id">,
): WorkspaceNode {
  return {
    id: overrides.id,
    position: overrides.position ?? { x: 10, y: 20 },
    width: overrides.width === undefined ? 240 : overrides.width,
    height: overrides.height === undefined ? 120 : overrides.height,
    zIndex: overrides.zIndex ?? 3,
    tempZIndex: overrides.tempZIndex ?? 1003,
    kind: overrides.kind ?? "leaf",
    style: overrides.style,
  };
}

describe("projectWorkspaceNodesToXyflow", () => {
  it("projects Workspace node geometry and selection without transferring presentation state", () => {
    const selected = createWorkspaceNode({
      id: "selected",
      position: { x: 32, y: 48 },
      width: 320,
      height: null,
      zIndex: 4,
      tempZIndex: 1004,
      style: { background: "#123456" },
    });
    const locked = createWorkspaceNode({ id: "locked" });

    const nodes = projectWorkspaceNodesToXyflow({
      activeSectionIds: [selected.id],
      canEditLayout: true,
      nodes: new Map([
        [selected.id, selected],
        [locked.id, locked],
      ]),
      sections: {
        selected: { positionAndSizeLocked: false },
        locked: { positionAndSizeLocked: true },
      },
    });

    expect(nodes[0]).toMatchObject({
      id: "selected",
      type: "workspace",
      data: { sectionId: "selected" },
      position: { x: 32, y: 48 },
      width: 320,
      zIndex: 1004,
      selected: true,
      draggable: true,
      selectable: true,
      connectable: false,
      deletable: false,
      focusable: false,
      className: NO_PAN_CLASS_NAME,
      style: { pointerEvents: "all" },
    });
    expect(nodes[0]).not.toHaveProperty("height");
    expect(nodes[1]).toMatchObject({
      id: "locked",
      selected: false,
      draggable: false,
    });
  });

  it("rejects a projected node that no longer has a section record", () => {
    const node = createWorkspaceNode({ id: "missing" });

    expect(() =>
      projectWorkspaceNodesToXyflow({
        activeSectionIds: [],
        canEditLayout: true,
        nodes: new Map([[node.id, node]]),
        sections: {},
      }),
    ).toThrow("Canvas node missing has no section record.");
  });
});
