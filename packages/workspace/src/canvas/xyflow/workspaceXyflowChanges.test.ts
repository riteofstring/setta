import { describe, expect, it } from "vitest";
import type {
  WorkspaceXyflowNodeChange,
  WorkspaceXyflowSectionNode,
} from "./types";
import { applyTransientWorkspaceXyflowNodeChanges } from "./workspaceXyflowChanges";

function createNode(
  overrides: Partial<WorkspaceXyflowSectionNode> &
    Pick<WorkspaceXyflowSectionNode, "id">,
): WorkspaceXyflowSectionNode {
  return {
    id: overrides.id,
    type: "workspace",
    data: { sectionId: overrides.id },
    position: overrides.position ?? { x: 0, y: 0 },
    width: overrides.width ?? 100,
    height: overrides.height ?? 80,
    selected: overrides.selected ?? false,
    draggable: overrides.draggable ?? true,
    selectable: overrides.selectable ?? true,
    connectable: false,
    deletable: false,
    focusable: false,
    zIndex: overrides.zIndex ?? 0,
  };
}

describe("applyTransientWorkspaceXyflowNodeChanges", () => {
  it("updates position and measurement previews while ignoring selection and structural changes", () => {
    const moving = createNode({ id: "moving" });
    const untouched = createNode({ id: "untouched", selected: true });
    const initialNodes = [moving, untouched];
    const changes: Array<WorkspaceXyflowNodeChange> = [
      {
        id: "moving",
        type: "position",
        position: { x: 30, y: 45 },
        dragging: true,
      },
      {
        id: "moving",
        type: "dimensions",
        dimensions: { width: 140, height: 95 },
        resizing: true,
      },
      { id: "moving", type: "select", selected: true },
      { id: "untouched", type: "remove" },
    ];

    const nextNodes = applyTransientWorkspaceXyflowNodeChanges(
      initialNodes,
      changes,
    );

    expect(nextNodes).not.toBe(initialNodes);
    expect(nextNodes[0]).toMatchObject({
      id: "moving",
      position: { x: 30, y: 45 },
      dragging: true,
      width: 140,
      height: 95,
      resizing: true,
      selected: false,
    });
    expect(nextNodes[1]).toBe(untouched);
  });

  it("retains the current preview reference when no transient fields change", () => {
    const initialNodes = [createNode({ id: "node" })];

    const nextNodes = applyTransientWorkspaceXyflowNodeChanges(initialNodes, [
      { id: "node", type: "select", selected: true },
      { id: "unknown", type: "remove" },
    ]);

    expect(nextNodes).toBe(initialNodes);
  });
});
