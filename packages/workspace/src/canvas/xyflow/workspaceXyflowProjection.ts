import { isGroupSection } from "../../document/documentSelectors";
import type {
  Node as WorkspaceNode,
  WorkspaceSection,
} from "../../document/types";
import { NO_PAN_CLASS_NAME } from "../../interaction";
import type { WorkspaceXyflowSectionNode } from "./types";

type WorkspaceXyflowProjectionInput = {
  activeSectionIds: ReadonlyArray<string>;
  canEditLayout: boolean;
  draggingSectionIds?: ReadonlySet<string>;
  nodes: ReadonlyMap<string, WorkspaceNode>;
  readyToBeVisible?: boolean;
  sections: Readonly<
    Record<
      string,
      Pick<
        WorkspaceSection,
        "kind" | "overflowMode" | "positionAndSizeLocked" | "size"
      >
    >
  >;
};

type WorkspaceXyflowProjectionValues = {
  draggable: boolean;
  dragging: boolean;
  initialHeight: number | undefined;
  initialWidth: number | undefined;
  readyToBeVisible: boolean;
  selected: boolean;
};

type WorkspaceXyflowProjectionEntry = WorkspaceXyflowProjectionValues & {
  height: number | null;
  node: WorkspaceXyflowSectionNode;
  positionX: number;
  positionY: number;
  tempZIndex: number;
  width: number | null;
};

export type WorkspaceXyflowNodeProjector = (
  input: WorkspaceXyflowProjectionInput,
) => Array<WorkspaceXyflowSectionNode>;

const EMPTY_SECTION_IDS = new Set<string>();

function getNodeMeasurement(node: WorkspaceNode) {
  if (node.width === null && node.height === null) {
    return {};
  }
  return {
    measured: {
      ...(node.width === null ? {} : { width: node.width }),
      ...(node.height === null ? {} : { height: node.height }),
    },
  };
}

function sectionOwnsDimension(
  section: WorkspaceXyflowProjectionInput["sections"][string],
  dimension: "height" | "width",
): boolean {
  return (
    section.size[dimension] !== "auto" &&
    (!isGroupSection(section) || section.overflowMode)
  );
}

function getProjectionValues({
  active,
  canEditLayout,
  dragging,
  node,
  readyToBeVisible,
  section,
}: {
  active: boolean;
  canEditLayout: boolean;
  dragging: boolean;
  node: WorkspaceNode;
  readyToBeVisible: boolean;
  section: WorkspaceXyflowProjectionInput["sections"][string];
}): WorkspaceXyflowProjectionValues {
  const draggable = canEditLayout && !section.positionAndSizeLocked;

  return {
    draggable,
    dragging,
    initialHeight:
      node.height === null || !sectionOwnsDimension(section, "height")
        ? undefined
        : node.height,
    initialWidth:
      node.width === null || !sectionOwnsDimension(section, "width")
        ? undefined
        : node.width,
    readyToBeVisible,
    selected: active,
  };
}

function entryMatches(
  entry: WorkspaceXyflowProjectionEntry,
  node: WorkspaceNode,
  values: WorkspaceXyflowProjectionValues,
): boolean {
  return (
    entry.positionX === node.position.x &&
    entry.positionY === node.position.y &&
    entry.width === node.width &&
    entry.height === node.height &&
    entry.tempZIndex === node.tempZIndex &&
    entry.draggable === values.draggable &&
    entry.dragging === values.dragging &&
    entry.initialHeight === values.initialHeight &&
    entry.initialWidth === values.initialWidth &&
    entry.readyToBeVisible === values.readyToBeVisible &&
    entry.selected === values.selected
  );
}

function createProjectedNode(
  node: WorkspaceNode,
  values: WorkspaceXyflowProjectionValues,
): WorkspaceXyflowSectionNode {
  return {
    id: node.id,
    type: "workspace",
    data: { sectionId: node.id },
    position: { ...node.position },
    ...getNodeMeasurement(node),
    ...(values.initialWidth === undefined
      ? {}
      : { initialWidth: values.initialWidth }),
    ...(values.initialHeight === undefined
      ? {}
      : { initialHeight: values.initialHeight }),
    zIndex: node.tempZIndex,
    selected: values.selected,
    draggable: values.draggable,
    ...(values.dragging ? { dragging: true } : {}),
    selectable: false,
    connectable: false,
    deletable: false,
    focusable: false,
    className: values.draggable ? NO_PAN_CLASS_NAME : undefined,
    style: {
      pointerEvents: "all",
      visibility: values.readyToBeVisible ? "visible" : "hidden",
    },
  };
}

function createProjectionEntry(
  node: WorkspaceNode,
  values: WorkspaceXyflowProjectionValues,
): WorkspaceXyflowProjectionEntry {
  return {
    ...values,
    height: node.height,
    node: createProjectedNode(node, values),
    positionX: node.position.x,
    positionY: node.position.y,
    tempZIndex: node.tempZIndex,
    width: node.width,
  };
}

function arraysMatch<T>(left: ReadonlyArray<T>, right: ReadonlyArray<T>) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function createWorkspaceXyflowNodeProjector(): WorkspaceXyflowNodeProjector {
  let entries = new Map<string, WorkspaceXyflowProjectionEntry>();
  let previousNodes: Array<WorkspaceXyflowSectionNode> = [];

  return ({
    activeSectionIds,
    canEditLayout,
    draggingSectionIds = EMPTY_SECTION_IDS,
    nodes,
    readyToBeVisible = true,
    sections,
  }) => {
    const activeIds = new Set(activeSectionIds);
    const nextEntries = new Map<string, WorkspaceXyflowProjectionEntry>();
    const nextNodes = Array.from(nodes.values(), (node) => {
      const section = sections[node.id];
      if (!section) {
        throw new Error(`Canvas node ${node.id} has no section record.`);
      }
      const values = getProjectionValues({
        active: activeIds.has(node.id),
        canEditLayout,
        dragging: draggingSectionIds.has(node.id),
        node,
        readyToBeVisible,
        section,
      });
      const previousEntry = entries.get(node.id);
      const nextEntry =
        previousEntry && entryMatches(previousEntry, node, values)
          ? previousEntry
          : createProjectionEntry(node, values);
      nextEntries.set(node.id, nextEntry);
      return nextEntry.node;
    });

    entries = nextEntries;
    if (arraysMatch(previousNodes, nextNodes)) {
      return previousNodes;
    }
    previousNodes = nextNodes;
    return nextNodes;
  };
}

export function projectWorkspaceNodesToXyflow(
  input: WorkspaceXyflowProjectionInput,
): Array<WorkspaceXyflowSectionNode> {
  return createWorkspaceXyflowNodeProjector()(input);
}
