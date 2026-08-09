import type { Node, NodeChange, NodeProps, NodeTypes } from "@xyflow/react";
import { memo } from "react";

import type { WorkspaceDocument, WorkspacePoint, WorkspaceSection } from "../core.js";
import type { RootProjectionChange, RootProjectionInput } from "./transient-root-projection.js";
import { projectWorkspaceCanvasRoots, type WorkspaceCanvasRoot } from "./workspace-canvas-model.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { WorkspaceKeyboardMoveDirection } from "./workspace-root-movement.js";
import {
  WorkspaceSectionFrame,
  type WorkspaceSectionFrameProps,
} from "./workspace-section-frame.js";
import type {
  ResolvedSectionDefinition,
  WorkspaceSectionRegistry,
} from "./workspace-section-registry.js";
import {
  WorkspaceSectionResizeControls,
  type WorkspaceSectionResizeBindings,
} from "./workspace-section-resize-controls.js";
import {
  projectWorkspaceSectionChildren,
  synchronizeWorkspaceSectionTrees,
  WorkspaceSectionChildren,
  type WorkspaceSectionTreeBindings,
  type WorkspaceSectionTreeNode,
} from "./workspace-section-tree.js";
import type { WorkspaceSectionSelectionRequest } from "./workspace-selection.js";
import type { WorkspaceViewportCulling } from "./workspace-viewport-culling.js";

type WorkspaceRootNodeData = {
  appearance: "dark" | "light";
  childSections: readonly WorkspaceSectionTreeNode[];
  colorPalette: WorkspaceSectionFrameProps["colorPalette"];
  definition: ResolvedSectionDefinition<unknown>;
  geometry: WorkspaceGeometryMeasurements;
  layoutEditable: boolean;
  moving: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  onLockedCommit: WorkspaceSectionFrameProps["onLockedCommit"];
  onMinimizedCommit: WorkspaceSectionFrameProps["onMinimizedCommit"];
  onOrientationCommit: WorkspaceSectionFrameProps["onOrientationCommit"];
  onOverflowCommit: WorkspaceSectionFrameProps["onOverflowCommit"];
  onPresentationCommit: WorkspaceSectionFrameProps["onPresentationCommit"];
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  onTitleCommit: WorkspaceSectionFrameProps["onTitleCommit"];
  order: number;
  presentationEditable: boolean;
  readOnly: boolean;
  resizeBindings: WorkspaceSectionResizeBindings;
  resizing: boolean;
  selected: boolean;
  selectionMovementBlocked: boolean;
  section: WorkspaceSection<unknown>;
  sectionId: string;
  title: string;
  validateTitle: WorkspaceSectionFrameProps["validateTitle"];
  viewportCulling: WorkspaceViewportCulling;
};

export type WorkspaceRootNode = Node<WorkspaceRootNodeData, "workspace-root-shell">;

export type ActiveRootMovement = Readonly<{
  baselinePositions: Readonly<Record<string, WorkspacePoint>>;
  primarySectionId: string;
  sectionIds: readonly string[];
}>;

export type RootSelectionProjection = Readonly<{
  movementBlocked: boolean;
  selectedSectionIds: ReadonlySet<string>;
  structuralMovementBlocked: boolean;
}>;

function WorkspaceRootShell({ data }: NodeProps<WorkspaceRootNode>) {
  const treeBindings: WorkspaceSectionTreeBindings = {
    appearance: data.appearance,
    colorPalette: data.colorPalette,
    geometry: data.geometry,
    layoutEditable: data.layoutEditable,
    onKeyboardMove: data.onKeyboardMove,
    onLockedCommit: data.onLockedCommit,
    onMinimizedCommit: data.onMinimizedCommit,
    onOrientationCommit: data.onOrientationCommit,
    onOverflowCommit: data.onOverflowCommit,
    onPresentationCommit: data.onPresentationCommit,
    onSelectionRequest: data.onSelectionRequest,
    onTitleCommit: data.onTitleCommit,
    presentationEditable: data.presentationEditable,
    readOnly: data.readOnly,
    validateTitle: data.validateTitle,
    viewportCulling: data.viewportCulling,
  };
  const rootTreeNode: WorkspaceSectionTreeNode = {
    children: data.childSections,
    definition: data.definition,
    position: null,
    section: data.section,
    selected: data.selected,
    selectionMovementBlocked: data.selectionMovementBlocked,
  };
  return (
    <>
      <WorkspaceSectionFrame
        appearance={data.appearance}
        childSectionRegion={
          <WorkspaceSectionChildren bindings={treeBindings} depth={0} node={rootTreeNode} />
        }
        colorPalette={data.colorPalette}
        definition={data.definition}
        depth={0}
        freeformChild={false}
        geometry={data.geometry}
        layoutEditable={data.layoutEditable}
        moving={data.moving}
        onKeyboardMove={data.onKeyboardMove}
        onLockedCommit={data.onLockedCommit}
        onMinimizedCommit={data.onMinimizedCommit}
        onOrientationCommit={data.onOrientationCommit}
        onOverflowCommit={data.onOverflowCommit}
        onPresentationCommit={data.onPresentationCommit}
        onSelectionRequest={data.onSelectionRequest}
        onTitleCommit={data.onTitleCommit}
        order={data.order}
        parentSectionId={null}
        presentationEditable={data.presentationEditable}
        readOnly={data.readOnly}
        resizing={data.resizing}
        selected={data.selected}
        selectionMovementBlocked={data.selectionMovementBlocked}
        section={data.section}
        validateTitle={data.validateTitle}
        viewportCulling={data.viewportCulling}
      />
      <WorkspaceSectionResizeControls
        bindings={data.resizeBindings}
        definition={data.definition}
        layoutEditable={data.layoutEditable}
        section={data.section}
        selected={data.selected}
      />
    </>
  );
}

function rootShellPropsMatch(
  left: Readonly<NodeProps<WorkspaceRootNode>>,
  right: Readonly<NodeProps<WorkspaceRootNode>>,
): boolean {
  return left.data === right.data;
}

const MemoizedWorkspaceRootShell = memo(WorkspaceRootShell, rootShellPropsMatch);
export const workspaceNodeTypes = {
  "workspace-root-shell": MemoizedWorkspaceRootShell,
} satisfies NodeTypes;

function rootNodeClassName(section: WorkspaceSection<unknown>): string {
  return [
    "setta-workspace__root-node",
    section.size.width.mode === "content" ? "setta-workspace__root-node--content-width" : "",
    section.size.height.mode === "content" ? "setta-workspace__root-node--content-height" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function rootNodeStyle(
  section: WorkspaceSection<unknown>,
  definition: ResolvedSectionDefinition<unknown>,
): NonNullable<WorkspaceRootNode["style"]> {
  return {
    maxHeight: section.isMinimized ? undefined : definition.resize.maxSize.height,
    maxWidth: definition.resize.maxSize.width,
    minHeight: section.isMinimized ? undefined : definition.resize.minSize.height,
    minWidth: definition.resize.minSize.width,
  };
}

function rootNodeIsDraggable(
  layoutEditable: boolean,
  section: WorkspaceSection<unknown>,
  selectionMovementBlocked: boolean,
): boolean {
  return layoutEditable && !section.positionAndSizeLocked && !selectionMovementBlocked;
}

function applyRootNodeDimensions(
  node: WorkspaceRootNode,
  root: WorkspaceCanvasRoot,
  section: WorkspaceSection<unknown>,
): void {
  if (!node.style) {
    throw new Error(`Workspace root node ${root.sectionId} is missing its sizing style.`);
  }
  if (section.size.width.mode === "fixed") {
    node.width = root.size.width;
  } else {
    node.style.width = "max-content";
  }
  if (!section.isMinimized && section.size.height.mode === "fixed") {
    node.height = root.size.height;
  } else if (!section.isMinimized) {
    node.style.height = "max-content";
  }
}

function rootNode(
  root: WorkspaceCanvasRoot,
  childSections: readonly WorkspaceSectionTreeNode[],
  geometry: WorkspaceGeometryMeasurements,
  section: WorkspaceSection<unknown>,
  definition: ResolvedSectionDefinition<unknown>,
  colorPalette: WorkspaceRootNodeData["colorPalette"],
  appearance: "dark" | "light",
  readOnly: boolean,
  layoutEditable: boolean,
  presentationEditable: boolean,
  onKeyboardMove: WorkspaceRootNodeData["onKeyboardMove"],
  onLockedCommit: WorkspaceRootNodeData["onLockedCommit"],
  onMinimizedCommit: WorkspaceRootNodeData["onMinimizedCommit"],
  onOrientationCommit: WorkspaceRootNodeData["onOrientationCommit"],
  onOverflowCommit: WorkspaceRootNodeData["onOverflowCommit"],
  onPresentationCommit: WorkspaceRootNodeData["onPresentationCommit"],
  onSelectionRequest: WorkspaceRootNodeData["onSelectionRequest"],
  onTitleCommit: WorkspaceRootNodeData["onTitleCommit"],
  validateTitle: WorkspaceRootNodeData["validateTitle"],
  viewportCulling: WorkspaceViewportCulling,
  resizeBindings: WorkspaceSectionResizeBindings,
  selection: RootSelectionProjection,
): WorkspaceRootNode {
  const selected = selection.selectedSectionIds.has(root.sectionId);
  const selectionMovementBlocked = selected && selection.movementBlocked;
  const node: WorkspaceRootNode = {
    ariaLabel: root.title,
    data: {
      appearance,
      childSections,
      colorPalette,
      definition,
      geometry,
      layoutEditable,
      moving: false,
      onKeyboardMove,
      onLockedCommit,
      onMinimizedCommit,
      onOrientationCommit,
      onOverflowCommit,
      onPresentationCommit,
      onSelectionRequest,
      onTitleCommit,
      order: root.order,
      presentationEditable,
      readOnly,
      resizeBindings,
      resizing: false,
      selected,
      selectionMovementBlocked,
      section,
      sectionId: root.sectionId,
      title: root.title,
      validateTitle,
      viewportCulling,
    },
    dragHandle: ".setta-workspace__section-drag-handle--root",
    draggable: rootNodeIsDraggable(layoutEditable, section, selectionMovementBlocked),
    focusable: false,
    id: root.sectionId,
    position: { ...root.position },
    selected,
    selectable: false,
    type: "workspace-root-shell",
    zIndex: root.order,
  };
  node.className = rootNodeClassName(section);
  node.style = rootNodeStyle(section, definition);
  applyRootNodeDimensions(node, root, section);
  return node;
}

export function projectNodes<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  geometry: WorkspaceGeometryMeasurements,
  sectionRegistry: WorkspaceSectionRegistry<TSectionData>,
  colorPalette: WorkspaceRootNodeData["colorPalette"],
  appearance: "dark" | "light",
  readOnly: boolean,
  layoutEditable: boolean,
  presentationEditable: boolean,
  onKeyboardMove: WorkspaceRootNodeData["onKeyboardMove"],
  onLockedCommit: WorkspaceRootNodeData["onLockedCommit"],
  onMinimizedCommit: WorkspaceRootNodeData["onMinimizedCommit"],
  onOrientationCommit: WorkspaceRootNodeData["onOrientationCommit"],
  onOverflowCommit: WorkspaceRootNodeData["onOverflowCommit"],
  onPresentationCommit: WorkspaceRootNodeData["onPresentationCommit"],
  onSelectionRequest: WorkspaceRootNodeData["onSelectionRequest"],
  onTitleCommit: WorkspaceRootNodeData["onTitleCommit"],
  validateTitle: WorkspaceRootNodeData["validateTitle"],
  viewportCulling: WorkspaceViewportCulling,
  resizeBindings: WorkspaceSectionResizeBindings,
  selection: RootSelectionProjection,
): WorkspaceRootNode[] {
  return projectWorkspaceCanvasRoots(document).map((root) => {
    const section = document.sections[root.sectionId];
    const definition = section ? sectionRegistry.definition(section.kind) : undefined;
    if (!section || !definition) {
      throw new Error(`Workspace root frame is missing registration for ${root.sectionId}.`);
    }
    return rootNode(
      root,
      projectWorkspaceSectionChildren(
        document,
        sectionRegistry,
        root.sectionId,
        selection.selectedSectionIds,
        selection.structuralMovementBlocked,
      ),
      geometry,
      section as WorkspaceSection<unknown>,
      definition as ResolvedSectionDefinition<unknown>,
      colorPalette,
      appearance,
      readOnly,
      layoutEditable,
      presentationEditable,
      onKeyboardMove,
      onLockedCommit,
      onMinimizedCommit,
      onOrientationCommit,
      onOverflowCommit,
      onPresentationCommit,
      onSelectionRequest,
      onTitleCommit,
      validateTitle,
      viewportCulling,
      resizeBindings,
      selection,
    );
  });
}

function shallowPropertiesMatch(left: object, right: object): boolean {
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftRecord);
  return (
    leftKeys.length === Object.keys(rightRecord).length &&
    leftKeys.every((key) => Object.is(leftRecord[key], rightRecord[key]))
  );
}

function nodeStylesMatch(
  left: WorkspaceRootNode["style"],
  right: WorkspaceRootNode["style"],
): boolean {
  if (!left || !right) {
    return left === right;
  }
  return shallowPropertiesMatch(left, right);
}

function nodePositionsMatch(left: WorkspacePoint, right: WorkspacePoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function synchronizeNodeData(
  existing: WorkspaceRootNode,
  node: WorkspaceRootNode,
): WorkspaceRootNode["data"] {
  const childSections = synchronizeWorkspaceSectionTrees(
    existing.data.childSections,
    node.data.childSections,
  );
  const projectedData =
    childSections === node.data.childSections ? node.data : { ...node.data, childSections };
  const data = shallowPropertiesMatch(existing.data, projectedData) ? existing.data : projectedData;
  return data;
}

function synchronizeNode(existing: WorkspaceRootNode, node: WorkspaceRootNode): WorkspaceRootNode {
  const data = synchronizeNodeData(existing, node);
  const position = nodePositionsMatch(existing.position, node.position)
    ? existing.position
    : { ...node.position };
  const style = nodeStylesMatch(existing.style, node.style) ? existing.style : node.style;
  const synchronized: WorkspaceRootNode = {
    ...existing,
    ...node,
    data,
    position,
  };
  if (style) {
    synchronized.style = style;
  } else {
    delete synchronized.style;
  }
  if (node.data.section.size.width.mode === "content") {
    delete synchronized.width;
  }
  delete synchronized.initialWidth;
  if (node.data.section.isMinimized || node.data.section.size.height.mode === "content") {
    delete synchronized.height;
  }
  delete synchronized.initialHeight;
  return shallowPropertiesMatch(existing, synchronized) ? existing : synchronized;
}

export function synchronizeNodes(
  current: readonly WorkspaceRootNode[],
  projected: readonly WorkspaceRootNode[],
): WorkspaceRootNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  return projected.map((node) => {
    const existing = currentById.get(node.id);
    return existing ? synchronizeNode(existing, node) : node;
  });
}

export function rootProjectionInputs(
  nodes: readonly WorkspaceRootNode[],
): readonly RootProjectionInput[] {
  return nodes.map((node) => ({
    position: { ...node.position },
    sectionId: node.id,
    size: {
      height: node.data.section.size.height.value,
      width: node.data.section.size.width.value,
    },
    selected: node.data.selected,
  }));
}

export function rootProjectionChange(
  change: NodeChange<WorkspaceRootNode>,
): RootProjectionChange | null {
  if (change.type === "position" && change.position) {
    return {
      dragging: change.dragging ?? false,
      position: { ...change.position },
      sectionId: change.id,
      type: "position",
    };
  }
  if (change.type === "dimensions" && change.dimensions) {
    return {
      resizing: change.resizing ?? false,
      sectionId: change.id,
      size: { ...change.dimensions },
      type: "dimensions",
    };
  }
  if (change.type === "select") {
    return { sectionId: change.id, selected: change.selected, type: "selection" };
  }
  return null;
}

export function setActiveRoots(
  nodes: readonly WorkspaceRootNode[],
  activeSectionIds: ReadonlySet<string>,
): WorkspaceRootNode[] {
  return nodes.map((node) => {
    const moving = activeSectionIds.has(node.id);
    const zIndex = moving ? nodes.length + node.data.order : node.data.order;
    if (node.data.moving === moving && node.zIndex === zIndex) {
      return node;
    }
    return { ...node, data: { ...node.data, moving }, zIndex };
  });
}

export function setResizingRoot(
  nodes: readonly WorkspaceRootNode[],
  sectionId: string | null,
): WorkspaceRootNode[] {
  return nodes.map((node) => {
    const resizing = node.id === sectionId;
    const zIndex = resizing ? nodes.length + node.data.order : node.data.order;
    if (node.data.resizing === resizing && node.zIndex === zIndex) {
      return node;
    }
    return { ...node, data: { ...node.data, resizing }, zIndex };
  });
}

export function normalizeSelectedRootChanges(
  changes: readonly NodeChange<WorkspaceRootNode>[],
  movement: ActiveRootMovement | null,
): readonly NodeChange<WorkspaceRootNode>[] {
  if (!movement || movement.sectionIds.length < 2) {
    return changes;
  }
  const primaryChange = changes.find(
    (change) =>
      change.type === "position" &&
      change.id === movement.primarySectionId &&
      change.position !== undefined,
  );
  if (!primaryChange || primaryChange.type !== "position" || !primaryChange.position) {
    return changes;
  }
  const primaryBaseline = movement.baselinePositions[movement.primarySectionId];
  if (!primaryBaseline) {
    throw new Error("Selected root movement is missing its primary baseline position.");
  }
  const delta = {
    x: primaryChange.position.x - primaryBaseline.x,
    y: primaryChange.position.y - primaryBaseline.y,
  };
  const movingIds = new Set(movement.sectionIds);
  const unrelatedChanges = changes.filter(
    (change) => change.type !== "position" || !movingIds.has(change.id),
  );
  return [
    ...unrelatedChanges,
    ...movement.sectionIds.map((sectionId) => {
      const baseline = movement.baselinePositions[sectionId];
      if (!baseline) {
        throw new Error(`Selected root movement is missing baseline position ${sectionId}.`);
      }
      const normalizedChange = {
        id: sectionId,
        position: { x: baseline.x + delta.x, y: baseline.y + delta.y },
        type: "position" as const,
      };
      return primaryChange.dragging === undefined
        ? normalizedChange
        : { ...normalizedChange, dragging: primaryChange.dragging };
    }),
  ];
}
