import { describe, expect, it } from "vitest";
import type {
  Node as WorkspaceNode,
  WorkspaceSection,
} from "../../document/types";
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

function createSection(
  overrides: Partial<
    Pick<
      WorkspaceSection,
      "kind" | "overflowMode" | "positionAndSizeLocked" | "size"
    >
  > = {},
): Pick<
  WorkspaceSection,
  "kind" | "overflowMode" | "positionAndSizeLocked" | "size"
> {
  return {
    kind: overrides.kind ?? "leaf",
    overflowMode: overrides.overflowMode ?? false,
    positionAndSizeLocked: overrides.positionAndSizeLocked ?? false,
    size: overrides.size ?? { width: "auto", height: "auto" },
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
        selected: createSection(),
        locked: createSection({ positionAndSizeLocked: true }),
      },
    });

    expect(nodes[0]).toMatchObject({
      id: "selected",
      type: "workspace",
      data: { sectionId: "selected" },
      position: { x: 32, y: 48 },
      measured: { width: 320 },
      zIndex: 1004,
      selected: true,
      draggable: true,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      className: NO_PAN_CLASS_NAME,
      style: { pointerEvents: "all" },
    });
    expect(nodes[0]).not.toHaveProperty("width");
    expect(nodes[0]).not.toHaveProperty("height");
    expect(nodes[0]).not.toHaveProperty("initialWidth");
    expect(nodes[0]).not.toHaveProperty("initialHeight");
    expect(nodes[1]).toMatchObject({
      id: "locked",
      selected: false,
      draggable: false,
    });
  });

  it("seeds only dimensions rendered by the Workspace section surface", () => {
    const leaf = createWorkspaceNode({ id: "leaf", width: 202, height: 124 });
    const autoGroup = createWorkspaceNode({
      id: "auto-group",
      width: 520,
      height: 360,
      kind: "group",
    });
    const boundedGroup = createWorkspaceNode({
      id: "bounded-group",
      width: 520,
      height: 360,
      kind: "group",
    });

    const nodes = projectWorkspaceNodesToXyflow({
      activeSectionIds: [],
      canEditLayout: true,
      nodes: new Map([
        [leaf.id, leaf],
        [autoGroup.id, autoGroup],
        [boundedGroup.id, boundedGroup],
      ]),
      sections: {
        leaf: createSection({ size: { width: 200, height: "auto" } }),
        "auto-group": createSection({
          kind: "group",
          overflowMode: false,
          size: { width: 500, height: 340 },
        }),
        "bounded-group": createSection({
          kind: "group",
          overflowMode: true,
          size: { width: 500, height: 340 },
        }),
      },
    });

    expect(nodes[0]).toMatchObject({
      measured: { width: 202, height: 124 },
      initialWidth: 202,
    });
    expect(nodes[0]).not.toHaveProperty("initialHeight");
    expect(nodes[0]).not.toHaveProperty("width");
    expect(nodes[0]).not.toHaveProperty("height");
    expect(nodes[1]).toMatchObject({
      measured: { width: 520, height: 360 },
    });
    expect(nodes[1]).not.toHaveProperty("initialWidth");
    expect(nodes[1]).not.toHaveProperty("initialHeight");
    expect(nodes[2]).toMatchObject({
      measured: { width: 520, height: 360 },
      initialWidth: 520,
      initialHeight: 360,
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
