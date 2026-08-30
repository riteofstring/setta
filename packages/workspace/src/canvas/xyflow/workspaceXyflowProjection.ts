import { NO_PAN_CLASS_NAME } from "../../interaction";
import type { Node as WorkspaceNode } from "../../document/types";
import type { WorkspaceXyflowSectionNode } from "./types";

type WorkspaceXyflowProjectionInput = {
  activeSectionIds: ReadonlyArray<string>;
  canEditLayout: boolean;
  nodes: ReadonlyMap<string, WorkspaceNode>;
  sections: Readonly<Record<string, { positionAndSizeLocked: boolean }>>;
};

function getNodeDimensions(node: WorkspaceNode): {
  height?: number;
  width?: number;
} {
  return {
    ...(node.width === null ? {} : { width: node.width }),
    ...(node.height === null ? {} : { height: node.height }),
  };
}

export function projectWorkspaceNodesToXyflow({
  activeSectionIds,
  canEditLayout,
  nodes,
  sections,
}: WorkspaceXyflowProjectionInput): Array<WorkspaceXyflowSectionNode> {
  const activeIds = new Set(activeSectionIds);

  return Array.from(nodes.values(), (node) => {
    const section = sections[node.id];
    if (!section) {
      throw new Error(`Canvas node ${node.id} has no section record.`);
    }
    const draggable = canEditLayout && !section.positionAndSizeLocked;

    return {
      id: node.id,
      type: "workspace",
      data: { sectionId: node.id },
      position: { ...node.position },
      ...getNodeDimensions(node),
      zIndex: node.tempZIndex,
      selected: activeIds.has(node.id),
      draggable,
      selectable: true,
      connectable: false,
      deletable: false,
      focusable: false,
      className: draggable ? NO_PAN_CLASS_NAME : undefined,
      style: { pointerEvents: "all" },
    };
  });
}
