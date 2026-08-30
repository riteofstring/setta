import type {
  WorkspaceXyflowNodeChange,
  WorkspaceXyflowSectionNode,
} from "./types";

type WorkspaceXyflowDimensionChange = Extract<
  WorkspaceXyflowNodeChange,
  { type: "dimensions" }
>;

type WorkspaceXyflowPositionChange = Extract<
  WorkspaceXyflowNodeChange,
  { type: "position" }
>;

type WorkspaceXyflowDimensionUpdate = Pick<
  WorkspaceXyflowSectionNode,
  "height" | "resizing" | "width"
>;

function updateNode(
  nodes: ReadonlyArray<WorkspaceXyflowSectionNode>,
  id: string,
  update: (node: WorkspaceXyflowSectionNode) => WorkspaceXyflowSectionNode,
): Array<WorkspaceXyflowSectionNode> {
  const index = nodes.findIndex((node) => node.id === id);
  if (index === -1) {
    return nodes as Array<WorkspaceXyflowSectionNode>;
  }
  const current = nodes[index];
  if (!current) {
    return nodes as Array<WorkspaceXyflowSectionNode>;
  }
  const next = update(current);
  if (next === current) {
    return nodes as Array<WorkspaceXyflowSectionNode>;
  }
  const nextNodes = [...nodes];
  nextNodes[index] = next;
  return nextNodes;
}

function applyPositionChange(
  node: WorkspaceXyflowSectionNode,
  change: WorkspaceXyflowPositionChange,
): WorkspaceXyflowSectionNode {
  const position = change.position ?? node.position;
  const dragging = change.dragging ?? node.dragging;
  if (
    position.x === node.position.x &&
    position.y === node.position.y &&
    dragging === node.dragging
  ) {
    return node;
  }
  return {
    ...node,
    position: { ...position },
    ...(change.dragging === undefined ? {} : { dragging }),
  };
}

function applyDimensionChange(
  node: WorkspaceXyflowSectionNode,
  change: WorkspaceXyflowDimensionChange,
): WorkspaceXyflowSectionNode {
  const update = createDimensionUpdate(change);
  return dimensionsMatch(node, update) ? node : { ...node, ...update };
}

function createDimensionUpdate(
  change: WorkspaceXyflowDimensionChange,
): WorkspaceXyflowDimensionUpdate {
  const update: WorkspaceXyflowDimensionUpdate = {};
  const dimensions = change.dimensions;
  if (dimensions?.width !== undefined) {
    update.width = dimensions.width;
  }
  if (dimensions?.height !== undefined) {
    update.height = dimensions.height;
  }
  if (change.resizing !== undefined) {
    update.resizing = change.resizing;
  }
  return update;
}

function dimensionsMatch(
  node: WorkspaceXyflowSectionNode,
  update: WorkspaceXyflowDimensionUpdate,
): boolean {
  return (
    (update.width === undefined || update.width === node.width) &&
    (update.height === undefined || update.height === node.height) &&
    (update.resizing === undefined || update.resizing === node.resizing)
  );
}

export function applyTransientWorkspaceXyflowNodeChanges(
  initialNodes: ReadonlyArray<WorkspaceXyflowSectionNode>,
  changes: ReadonlyArray<WorkspaceXyflowNodeChange>,
): Array<WorkspaceXyflowSectionNode> {
  let nodes = initialNodes as Array<WorkspaceXyflowSectionNode>;

  for (const change of changes) {
    if (change.type === "position") {
      nodes = updateNode(nodes, change.id, (node) =>
        applyPositionChange(node, change),
      );
      continue;
    }

    if (change.type === "dimensions") {
      nodes = updateNode(nodes, change.id, (node) =>
        applyDimensionChange(node, change),
      );
    }
  }

  return nodes;
}
