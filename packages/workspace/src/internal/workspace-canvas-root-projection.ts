import { applyNodeChanges, type OnNodeDrag, type OnNodesChange } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type {
  SectionOverflow,
  WorkspaceActionResult,
  WorkspaceDocument,
  WorkspaceJsonValue,
  WorkspacePoint,
  WorkspaceSectionPresentation,
} from "../core.js";
import { TransientRootProjection, type RootProjectionChange } from "./transient-root-projection.js";
import {
  normalizeSelectedRootChanges,
  projectNodes,
  rootProjectionChange,
  rootProjectionInputs,
  setActiveRoots,
  synchronizeNodes,
  type ActiveRootMovement,
  type RootSelectionProjection,
  type WorkspaceRootNode,
} from "./workspace-canvas-root-node.js";
import { useWorkspaceCanvasRootResizing } from "./workspace-canvas-root-resizing.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import {
  moveWorkspaceRootWithKeyboard,
  type WorkspaceKeyboardMoveDirection,
} from "./workspace-root-movement.js";
import type {
  WorkspaceSectionColorOption,
  WorkspaceSectionTitleValidator,
} from "./workspace-section-contract.js";
import { useWorkspaceSectionOverflowActions } from "./workspace-section-overflow.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";
import type { WorkspaceSectionResizeBindings } from "./workspace-section-resize-controls.js";
import {
  type WorkspaceRootResizeSnapshot,
  type WorkspaceSectionResizeAxis,
} from "./workspace-section-sizing.js";
import { useWorkspaceSectionStateActions } from "./workspace-section-state-actions.js";
import {
  resolveWorkspaceRootSelection,
  translateWorkspaceRootSelection,
  type WorkspaceSectionSelectionRequest,
} from "./workspace-selection.js";

type PendingRootMovement = Readonly<{
  positions: Readonly<Record<string, WorkspacePoint>>;
  sectionId: string;
  sectionCount: number;
  title: string;
}>;

function resizeHandlersAt(
  handlersRef: RefObject<WorkspaceSectionResizeBindings | null>,
): WorkspaceSectionResizeBindings {
  if (!handlersRef.current) {
    throw new Error("Workspace root resize handlers are unavailable before initialization.");
  }
  return handlersRef.current;
}

function rejectedMovementAnnouncement(title: string, reason: string): string {
  if (reason === "layout-edit-disabled") {
    return `${title} cannot move because layout editing is off.`;
  }
  if (reason === "section-locked") {
    return `${title} is locked. Unlock it to move it.`;
  }
  if (reason === "section-not-root") {
    return `${title} cannot move freely because it is nested.`;
  }
  return `Unable to move ${title}.`;
}

function movementAnnouncement(
  title: string,
  position: WorkspacePoint,
  result: WorkspaceActionResult,
  sectionCount = 1,
): string {
  const subject = sectionCount === 1 ? title : `${title} and ${String(sectionCount - 1)} more`;
  if (result.status === "applied") {
    return `${subject} moved to ${String(position.x)}, ${String(position.y)}.`;
  }
  if ("reason" in result) {
    return rejectedMovementAnnouncement(subject, result.reason);
  }
  return `${subject} stayed in place.`;
}

export function useWorkspaceCanvasRootProjection<TSectionData = WorkspaceJsonValue>({
  appearance,
  colorPalette,
  commitSelection,
  document,
  geometry,
  gridOptions,
  layoutEditable,
  onSectionLockedCommit,
  onSectionMinimizedCommit,
  onSectionOverflowCommit,
  onRootMoveCommit,
  onRootResizeCommit,
  onSelectionRequest,
  onSectionContentSizeCommit,
  onSectionPresentationCommit,
  onSectionTitleCommit,
  presentationEditable,
  readOnly,
  rootSelectionProjection,
  sectionRegistry,
  selectedSectionIdsRef,
  validateSectionTitle,
}: Readonly<{
  appearance: "dark" | "light";
  colorPalette: readonly WorkspaceSectionColorOption[];
  commitSelection(sectionIds: readonly string[]): WorkspaceActionResult;
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  gridOptions: ResolvedWorkspaceGridOptions;
  layoutEditable: boolean;
  onSectionLockedCommit(sectionId: string, locked: boolean): WorkspaceActionResult;
  onSectionMinimizedCommit(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
  onSectionOverflowCommit(
    sectionId: string,
    overflow: SectionOverflow,
    measuredSize: Readonly<{ height: number; width: number }> | null,
  ): WorkspaceActionResult;
  onRootMoveCommit(positions: Readonly<Record<string, WorkspacePoint>>): WorkspaceActionResult;
  onRootResizeCommit(
    sectionId: string,
    axes: readonly WorkspaceSectionResizeAxis[],
    resize: WorkspaceRootResizeSnapshot,
  ): WorkspaceActionResult;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  onSectionContentSizeCommit(
    sectionId: string,
    axes: readonly WorkspaceSectionResizeAxis[],
  ): WorkspaceActionResult;
  onSectionPresentationCommit(
    sectionId: string,
    presentation: WorkspaceSectionPresentation,
  ): WorkspaceActionResult;
  onSectionTitleCommit(sectionId: string, title: string): WorkspaceActionResult;
  presentationEditable: boolean;
  readOnly: boolean;
  rootSelectionProjection: RootSelectionProjection;
  sectionRegistry: WorkspaceSectionRegistry<TSectionData>;
  selectedSectionIdsRef: RefObject<readonly string[]>;
  validateSectionTitle: WorkspaceSectionTitleValidator;
}>) {
  const documentRef = useRef(document);
  const gridOptionsRef = useRef(gridOptions);
  const onRootMoveCommitRef = useRef(onRootMoveCommit);
  documentRef.current = document;
  gridOptionsRef.current = gridOptions;
  onRootMoveCommitRef.current = onRootMoveCommit;
  const [announcementText, setAnnouncementText] = useState("");
  const [synchronizationRevision, setSynchronizationRevision] = useState(0);
  const pendingRootMovementRef = useRef<PendingRootMovement | null>(null);
  const resizeHandlersRef = useRef<WorkspaceSectionResizeBindings | null>(null);
  const resizeBindings = useMemo<WorkspaceSectionResizeBindings>(
    () => ({
      onContentSizeRequest: (sectionId, handle) =>
        resizeHandlersAt(resizeHandlersRef).onContentSizeRequest(sectionId, handle),
      onKeyboardResize: (sectionId, handle, inlineEnd, key) =>
        resizeHandlersAt(resizeHandlersRef).onKeyboardResize(sectionId, handle, inlineEnd, key),
      onPointerResize: (sectionId, handle, resize) =>
        resizeHandlersAt(resizeHandlersRef).onPointerResize(sectionId, handle, resize),
      onPointerResizeEnd: (sectionId, handle, resize) =>
        resizeHandlersAt(resizeHandlersRef).onPointerResizeEnd(sectionId, handle, resize),
    }),
    [],
  );
  const sectionStateActions = useWorkspaceSectionStateActions({
    document,
    onLockedCommit: onSectionLockedCommit,
    onMinimizedCommit: onSectionMinimizedCommit,
  });
  const overflowActions = useWorkspaceSectionOverflowActions({
    document,
    geometry,
    onCommit: onSectionOverflowCommit,
  });
  const recordMovementResult = useCallback(
    (
      sectionId: string,
      title: string,
      positions: Readonly<Record<string, WorkspacePoint>>,
      result: WorkspaceActionResult,
    ) => {
      const position = positions[sectionId];
      if (!position) {
        throw new Error(`Workspace root movement omitted its active section ${sectionId}.`);
      }
      const sectionCount = Object.keys(positions).length;
      if (result.status === "applied") {
        pendingRootMovementRef.current = { positions, sectionCount, sectionId, title };
      } else {
        setAnnouncementText(movementAnnouncement(title, position, result, sectionCount));
      }
      setSynchronizationRevision((revision) => revision + 1);
    },
    [],
  );
  const handleKeyboardMove = useCallback(
    (sectionId: string, direction: WorkspaceKeyboardMoveDirection) => {
      const currentDocument = documentRef.current;
      const root = currentDocument.rootSections.find((entry) => entry.sectionId === sectionId);
      const section = currentDocument.sections[sectionId];
      if (!root || !section) {
        throw new Error(`Workspace root movement is missing section ${sectionId}.`);
      }
      const selection = resolveWorkspaceRootSelection(
        currentDocument,
        selectedSectionIdsRef.current,
        sectionId,
      );
      if (!selection.allowed) {
        setAnnouncementText(selection.reason);
        return;
      }
      if (!selectedSectionIdsRef.current.includes(sectionId)) {
        commitSelection([sectionId]);
      }
      const activePosition = moveWorkspaceRootWithKeyboard(
        root.position,
        direction,
        gridOptionsRef.current,
      );
      const positions = translateWorkspaceRootSelection(
        currentDocument,
        selection.block,
        sectionId,
        activePosition,
      );
      const result = onRootMoveCommitRef.current(positions);
      recordMovementResult(sectionId, section.title, positions, result);
    },
    [commitSelection, recordMovementResult, selectedSectionIdsRef],
  );
  const projectedNodes = useMemo(
    () =>
      projectNodes(
        document,
        geometry,
        sectionRegistry,
        colorPalette,
        appearance,
        readOnly,
        layoutEditable,
        presentationEditable,
        handleKeyboardMove,
        sectionStateActions.handleLockedCommit,
        sectionStateActions.handleMinimizedCommit,
        overflowActions.handleCommit,
        onSectionPresentationCommit,
        onSelectionRequest,
        onSectionTitleCommit,
        validateSectionTitle,
        resizeBindings,
        rootSelectionProjection,
      ),
    [
      appearance,
      colorPalette,
      document,
      geometry,
      handleKeyboardMove,
      layoutEditable,
      onSelectionRequest,
      onSectionPresentationCommit,
      onSectionTitleCommit,
      overflowActions.handleCommit,
      presentationEditable,
      readOnly,
      resizeBindings,
      rootSelectionProjection,
      sectionStateActions.handleLockedCommit,
      sectionStateActions.handleMinimizedCommit,
      sectionRegistry,
      validateSectionTitle,
    ],
  );
  const projectedNodesRef = useRef(projectedNodes);
  projectedNodesRef.current = projectedNodes;
  const [nodes, setNodes] = useState<WorkspaceRootNode[]>(projectedNodes);
  const rootProjectionRef = useRef<TransientRootProjection | null>(null);
  rootProjectionRef.current ??= new TransientRootProjection(
    rootProjectionInputs(projectedNodes),
    document.viewport,
  );
  const rootProjection = rootProjectionRef.current;
  const activeRootMoveRef = useRef<ActiveRootMovement | null>(null);
  const {
    announcementText: sizingAnnouncementText,
    bindings: rootResizeBindings,
    cancel: cancelRootResize,
    revision: rootResizeRevision,
    synchronize: synchronizeRootResize,
  } = useWorkspaceCanvasRootResizing({
    document,
    geometry,
    gridOptions,
    onRootResizeCommit,
    onSectionContentSizeCommit,
    rootProjection,
    sectionRegistry,
    setNodes,
  });
  resizeHandlersRef.current = rootResizeBindings;

  useEffect(() => {
    activeRootMoveRef.current = null;
    synchronizeRootResize(document);
    rootProjection.synchronizeRoots(rootProjectionInputs(projectedNodes));
    setNodes((current) => synchronizeNodes(current, projectedNodesRef.current));
    const pendingMovement = pendingRootMovementRef.current;
    if (pendingMovement) {
      const canonicalPositions = new Map(
        document.rootSections.map(({ position, sectionId }) => [sectionId, position]),
      );
      const accepted = Object.entries(pendingMovement.positions).every(([sectionId, position]) => {
        const canonical = canonicalPositions.get(sectionId);
        return canonical?.x === position.x && canonical.y === position.y;
      });
      const primaryPosition = pendingMovement.positions[pendingMovement.sectionId];
      if (!primaryPosition) {
        throw new Error("Pending root movement lost its active section position.");
      }
      setAnnouncementText(
        accepted
          ? movementAnnouncement(
              pendingMovement.title,
              primaryPosition,
              { status: "applied" },
              pendingMovement.sectionCount,
            )
          : movementAnnouncement(
              pendingMovement.title,
              primaryPosition,
              { status: "unchanged" },
              pendingMovement.sectionCount,
            ),
      );
      pendingRootMovementRef.current = null;
    }
    geometry.requestMeasurement();
  }, [
    document,
    geometry,
    projectedNodes,
    rootProjection,
    rootResizeRevision,
    synchronizationRevision,
    synchronizeRootResize,
  ]);

  const handleNodesChange = useCallback<OnNodesChange<WorkspaceRootNode>>(
    (changes) => {
      const packageChanges = normalizeSelectedRootChanges(changes, activeRootMoveRef.current);
      const layoutChanges = packageChanges.filter((change) => change.type !== "select");
      const projectionChanges = layoutChanges
        .map(rootProjectionChange)
        .filter((change): change is RootProjectionChange => change !== null);
      if (projectionChanges.length > 0) {
        rootProjection.applyRootChanges(projectionChanges);
      }
      if (layoutChanges.length > 0) {
        setNodes((current) => applyNodeChanges(layoutChanges, current));
      }
      geometry.requestMeasurement();
    },
    [geometry, rootProjection],
  );
  const handleNodeDragStart = useCallback<OnNodeDrag<WorkspaceRootNode>>(
    (_event, node, draggedNodes) => {
      if (!node.draggable) {
        return;
      }
      const selection = resolveWorkspaceRootSelection(
        documentRef.current,
        selectedSectionIdsRef.current,
        node.id,
      );
      if (!selection.allowed) {
        activeRootMoveRef.current = null;
        setAnnouncementText(selection.reason);
        return;
      }
      const draggedIds = new Set(draggedNodes.map(({ id }) => id));
      if (selection.block.sectionIds.some((sectionId) => !draggedIds.has(sectionId))) {
        activeRootMoveRef.current = null;
        setAnnouncementText("Unable to move the complete selected section block.");
        return;
      }
      if (!selectedSectionIdsRef.current.includes(node.id)) {
        commitSelection([node.id]);
      }
      rootProjection.beginRootMove(selection.block.sectionIds);
      activeRootMoveRef.current = {
        baselinePositions: Object.fromEntries(
          documentRef.current.rootSections.map(({ position, sectionId }) => [sectionId, position]),
        ),
        primarySectionId: node.id,
        sectionIds: selection.block.sectionIds,
      };
      const activeIds = new Set(selection.block.sectionIds);
      setNodes((current) => setActiveRoots(current, activeIds));
      const suffix =
        selection.block.sectionIds.length === 1
          ? ""
          : ` and ${String(selection.block.sectionIds.length - 1)} more`;
      setAnnouncementText(`Moving ${node.data.title}${suffix}.`);
    },
    [commitSelection, rootProjection, selectedSectionIdsRef],
  );
  const handleNodeDragStop = useCallback<OnNodeDrag<WorkspaceRootNode>>(
    (_event, node) => {
      const movement = activeRootMoveRef.current;
      if (!movement || movement.primarySectionId !== node.id) {
        activeRootMoveRef.current = null;
        setNodes((current) => synchronizeNodes(current, projectedNodes));
        return;
      }
      const projectedPositions = new Map(
        rootProjection.roots().map(({ position, sectionId }) => [sectionId, position]),
      );
      rootProjection.applyRootChanges(
        movement.sectionIds.map((sectionId) => {
          const position = projectedPositions.get(sectionId);
          if (!position) {
            throw new Error(`Selected root movement lost projected position ${sectionId}.`);
          }
          return {
            dragging: false,
            position,
            sectionId,
            type: "position" as const,
          };
        }),
      );
      const command = rootProjection.completeRootGesture();
      activeRootMoveRef.current = null;
      setNodes((current) => setActiveRoots(current, new Set()));
      if (!command || command.type !== "move-root-sections") {
        const suffix =
          movement.sectionIds.length === 1
            ? ""
            : ` and ${String(movement.sectionIds.length - 1)} more`;
        setAnnouncementText(`${node.data.title}${suffix} stayed in place.`);
        return;
      }
      const result = onRootMoveCommitRef.current(command.positions);
      recordMovementResult(node.id, node.data.title, command.positions, result);
    },
    [projectedNodes, recordMovementResult, rootProjection],
  );
  const cancelRootMovement = useCallback(() => {
    rootProjection.cancelRootGesture();
    activeRootMoveRef.current = null;
    cancelRootResize();
    setNodes((current) => synchronizeNodes(current, projectedNodesRef.current));
  }, [cancelRootResize, rootProjection]);

  return {
    announcementText,
    cancelRootMovement,
    containerLayoutAnnouncementText: overflowActions.announcementText,
    handleNodeDragStart,
    handleNodeDragStop,
    handleNodesChange,
    nodes,
    sectionStateAnnouncementText: sectionStateActions.announcementText,
    sizingAnnouncementText,
  };
}
