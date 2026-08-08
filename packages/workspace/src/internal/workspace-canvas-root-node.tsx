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
import type { WorkspaceSectionSelectionRequest } from "./workspace-selection.js";

type WorkspaceRootNodeData = {
  appearance: "dark" | "light";
  colorPalette: WorkspaceSectionFrameProps["colorPalette"];
  definition: ResolvedSectionDefinition<unknown>;
  geometry: WorkspaceGeometryMeasurements;
  layoutEditable: boolean;
  moving: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  onLockedCommit: WorkspaceSectionFrameProps["onLockedCommit"];
  onMinimizedCommit: WorkspaceSectionFrameProps["onMinimizedCommit"];
  onPresentationCommit: WorkspaceSectionFrameProps["onPresentationCommit"];
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  onTitleCommit: WorkspaceSectionFrameProps["onTitleCommit"];
  order: number;
  presentationEditable: boolean;
  readOnly: boolean;
  selected: boolean;
  selectionMovementBlocked: boolean;
  section: WorkspaceSection<unknown>;
  sectionId: string;
  title: string;
  validateTitle: WorkspaceSectionFrameProps["validateTitle"];
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
}>;

function WorkspaceRootShell({ data }: NodeProps<WorkspaceRootNode>) {
  return (
    <WorkspaceSectionFrame
      appearance={data.appearance}
      colorPalette={data.colorPalette}
      definition={data.definition}
      geometry={data.geometry}
      layoutEditable={data.layoutEditable}
      moving={data.moving}
      onKeyboardMove={data.onKeyboardMove}
      onLockedCommit={data.onLockedCommit}
      onMinimizedCommit={data.onMinimizedCommit}
      onPresentationCommit={data.onPresentationCommit}
      onSelectionRequest={data.onSelectionRequest}
      onTitleCommit={data.onTitleCommit}
      order={data.order}
      presentationEditable={data.presentationEditable}
      readOnly={data.readOnly}
      selected={data.selected}
      selectionMovementBlocked={data.selectionMovementBlocked}
      section={data.section}
      validateTitle={data.validateTitle}
    />
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

function rootNode(
  root: WorkspaceCanvasRoot,
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
  onPresentationCommit: WorkspaceRootNodeData["onPresentationCommit"],
  onSelectionRequest: WorkspaceRootNodeData["onSelectionRequest"],
  onTitleCommit: WorkspaceRootNodeData["onTitleCommit"],
  validateTitle: WorkspaceRootNodeData["validateTitle"],
  selection: RootSelectionProjection,
): WorkspaceRootNode {
  const selected = selection.selectedSectionIds.has(root.sectionId);
  const selectionMovementBlocked = selected && selection.movementBlocked;
  const node: WorkspaceRootNode = {
    ariaLabel: root.title,
    data: {
      appearance,
      colorPalette,
      definition,
      geometry,
      layoutEditable,
      moving: false,
      onKeyboardMove,
      onLockedCommit,
      onMinimizedCommit,
      onPresentationCommit,
      onSelectionRequest,
      onTitleCommit,
      order: root.order,
      presentationEditable,
      readOnly,
      selected,
      selectionMovementBlocked,
      section,
      sectionId: root.sectionId,
      title: root.title,
      validateTitle,
    },
    dragHandle: ".setta-workspace__section-drag-handle",
    draggable: layoutEditable && !section.positionAndSizeLocked && !selectionMovementBlocked,
    focusable: false,
    id: root.sectionId,
    position: { ...root.position },
    selected,
    selectable: false,
    type: "workspace-root-shell",
    width: root.size.width,
    zIndex: root.order,
  };
  if (!section.isMinimized) {
    node.height = root.size.height;
  }
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
  onPresentationCommit: WorkspaceRootNodeData["onPresentationCommit"],
  onSelectionRequest: WorkspaceRootNodeData["onSelectionRequest"],
  onTitleCommit: WorkspaceRootNodeData["onTitleCommit"],
  validateTitle: WorkspaceRootNodeData["validateTitle"],
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
      onPresentationCommit,
      onSelectionRequest,
      onTitleCommit,
      validateTitle,
      selection,
    );
  });
}

export function synchronizeNodes(
  current: readonly WorkspaceRootNode[],
  projected: readonly WorkspaceRootNode[],
): WorkspaceRootNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  return projected.map((node) => {
    const existing = currentById.get(node.id);
    if (!existing) {
      return node;
    }
    const synchronized = {
      ...existing,
      ...node,
      data: node.data,
      position: { ...node.position },
    };
    if (node.data.section.isMinimized) {
      delete synchronized.height;
    }
    return synchronized;
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
