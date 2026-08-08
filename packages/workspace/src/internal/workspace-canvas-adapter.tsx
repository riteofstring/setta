import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useViewport,
  ViewportPortal,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnNodesChange,
  type Viewport,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type {
  WorkspaceActionResult,
  WorkspaceController,
  WorkspaceDocument,
  WorkspaceGestureOptions,
  WorkspaceJsonValue,
  WorkspacePoint,
  WorkspaceSectionPresentation,
  WorkspaceViewport,
} from "../core.js";
import type {
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
  WorkspaceToolbarControl,
} from "../react.js";
import { WorkspaceGeometryIndex } from "./geometry-index.js";
import { TransientRootProjection, type RootProjectionChange } from "./transient-root-projection.js";
import { createWorkspaceCanvasGesturePolicy } from "./workspace-canvas-gesture-policy.js";
import {
  createWorkspaceCanvasController,
  type WorkspaceCanvasController,
} from "./workspace-canvas-navigation.js";
import {
  normalizeSelectedRootChanges,
  projectNodes,
  rootProjectionChange,
  rootProjectionInputs,
  setActiveRoots,
  synchronizeNodes,
  workspaceNodeTypes,
  type ActiveRootMovement,
  type RootSelectionProjection,
  type WorkspaceRootNode,
} from "./workspace-canvas-root-node.js";
import {
  useWorkspaceMarqueeSelection,
  WorkspaceSelectionOverlay,
} from "./workspace-canvas-selection.js";
import { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import {
  moveWorkspaceRootWithKeyboard,
  type WorkspaceKeyboardMoveDirection,
} from "./workspace-root-movement.js";
import type {
  WorkspaceSectionColorOption,
  WorkspaceSectionTitleValidator,
} from "./workspace-section-contract.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";
import {
  applyWorkspaceSectionSelectionRequest,
  resolveWorkspaceRootSelection,
  translateWorkspaceRootSelection,
  type WorkspaceSectionSelectionRequest,
} from "./workspace-selection.js";
import { WorkspaceToolbar } from "./workspace-toolbar.js";
import { WorkspaceViewportLifecycle } from "./workspace-viewport-lifecycle.js";
import {
  workspaceViewportsMatch,
  WorkspaceViewportSynchronizer,
} from "./workspace-viewport-synchronizer.js";

type PendingRootMovement = Readonly<{
  positions: Readonly<Record<string, WorkspacePoint>>;
  sectionId: string;
  sectionCount: number;
  title: string;
}>;

export type WorkspaceCanvasAdapterProps<TSectionData = WorkspaceJsonValue> = Readonly<{
  ariaLabel: string;
  appearance: "dark" | "light";
  controllerSynchronizationRevision: number;
  document: WorkspaceDocument<TSectionData>;
  emptyState: ReactNode;
  gestureOptions: WorkspaceGestureOptions;
  gridOptions: ResolvedWorkspaceGridOptions;
  layoutEditable: boolean;
  marqueeSelectionMode: "full" | "partial";
  minimapPlacement: WorkspaceMinimapPlacement;
  minimapVisible: boolean;
  onCanvasControllerChange(controller: WorkspaceCanvasController | null): void;
  onGridSnapChange(value: boolean): void;
  onMinimapVisibilityChange(value: boolean): void;
  onRootMoveCommit(positions: Readonly<Record<string, WorkspacePoint>>): WorkspaceActionResult;
  onSectionPresentationCommit(
    sectionId: string,
    presentation: WorkspaceSectionPresentation,
  ): WorkspaceActionResult;
  onSectionTitleCommit(sectionId: string, title: string): WorkspaceActionResult;
  onSelectionChange(sectionIds: readonly string[]): WorkspaceActionResult;
  onViewportCommit(viewport: WorkspaceViewport): void;
  overlaySlots: Partial<Record<WorkspaceOverlayPlacement, ReactNode>>;
  presentationEditable: boolean;
  readOnly: boolean;
  sectionColorPalette: readonly WorkspaceSectionColorOption[];
  sectionRegistry: WorkspaceSectionRegistry<TSectionData>;
  selectedSectionIds: readonly string[];
  toolbarControls: readonly WorkspaceToolbarControl<TSectionData>[];
  validateSectionTitle: WorkspaceSectionTitleValidator;
  workspaceController: WorkspaceController<TSectionData>;
}>;

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

function selectionAnnouncement(
  document: WorkspaceDocument<unknown>,
  selectedSectionIds: readonly string[],
): string {
  if (selectedSectionIds.length === 0) {
    return "Selection cleared.";
  }
  const selectedSections = selectedSectionIds.flatMap((sectionId) => {
    const section = document.sections[sectionId];
    return section ? [section] : [];
  });
  const subject =
    selectedSections.length === 1
      ? `${selectedSections[0]?.title ?? "Section"} selected.`
      : `${String(selectedSections.length)} sections selected.`;
  return selectedSections.some(({ positionAndSizeLocked }) => positionAndSizeLocked)
    ? `${subject} The selection contains a locked section and cannot move as a block.`
    : subject;
}

function targetAcceptsCanvasShortcut(target: EventTarget | null, ownerDocument: Document): boolean {
  const ElementConstructor = ownerDocument.defaultView?.Element;
  if (!ElementConstructor || !(target instanceof ElementConstructor)) {
    return true;
  }
  return !target.closest(
    "input, select, textarea, [contenteditable='true'], [data-workspace-local-shortcuts]",
  );
}

function backgroundVariant(pattern: ResolvedWorkspaceGridOptions["pattern"]): BackgroundVariant {
  if (pattern === "cross") {
    return BackgroundVariant.Cross;
  }
  if (pattern === "lines") {
    return BackgroundVariant.Lines;
  }
  return BackgroundVariant.Dots;
}

function WorkspaceGridBackground({
  canvasId,
  gridOptions,
  snapGrid,
}: Readonly<{
  canvasId: string;
  gridOptions: ResolvedWorkspaceGridOptions;
  snapGrid: [number, number];
}>) {
  const { zoom } = useViewport();
  return (
    <div aria-hidden="true" className="setta-workspace__grid">
      <Background
        bgColor="var(--setta-workspace-canvas-background)"
        color="var(--setta-workspace-grid-color)"
        gap={snapGrid}
        id={`${canvasId}-grid`}
        lineWidth={gridOptions.markSize * zoom}
        size={gridOptions.markSize}
        variant={backgroundVariant(gridOptions.pattern)}
      />
    </div>
  );
}

function hasOverlayContent(value: ReactNode): boolean {
  return value !== null && value !== undefined && value !== false;
}

function WorkspaceFixedOverlay({
  children,
  placement,
}: Readonly<{
  children: ReactNode;
  placement: Exclude<WorkspaceOverlayPlacement, "canvas">;
}>) {
  if (!hasOverlayContent(children)) {
    return null;
  }
  return (
    <div
      className={`setta-workspace__overlay setta-workspace__overlay--${placement} ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      data-workspace-overlay-placement={placement}
    >
      {children}
    </div>
  );
}

function WorkspaceMinimap({
  ariaLabel,
  id,
  placement,
  visible,
}: Readonly<{
  ariaLabel: string;
  id: string;
  placement: WorkspaceMinimapPlacement;
  visible: boolean;
}>) {
  return (
    <div data-workspace-minimap-placement={placement} hidden={!visible} id={id}>
      {visible ? (
        <MiniMap<WorkspaceRootNode>
          ariaLabel={`${ariaLabel} minimap`}
          bgColor="var(--setta-workspace-minimap-background)"
          className={`setta-workspace__minimap ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
          maskColor="color-mix(in oklch, var(--setta-workspace-canvas-background) 72%, transparent)"
          maskStrokeColor="var(--setta-workspace-selection)"
          maskStrokeWidth={2}
          nodeBorderRadius={6}
          nodeColor={(node) =>
            node.data.section.presentation.accentColor ??
            "var(--setta-workspace-section-background)"
          }
          nodeStrokeColor="var(--setta-workspace-section-muted-text)"
          pannable={false}
          position={placement === "left" ? "bottom-left" : "bottom-right"}
          zoomable={false}
        />
      ) : null}
    </div>
  );
}

function viewportFromUpstream(viewport: Viewport): WorkspaceViewport {
  return { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
}

function advanceViewportLifecycle(
  lifecycle: WorkspaceViewportLifecycle,
  viewport: WorkspaceViewport,
  programmaticViewport: WorkspaceViewport | null,
  event: MouseEvent | TouchEvent | null,
  phase: "begin" | "update",
) {
  if (!event && programmaticViewport) {
    lifecycle.synchronize(viewport);
    return;
  }
  if (phase === "begin") {
    if (lifecycle.isActive()) {
      lifecycle.update(viewport);
    } else {
      lifecycle.begin(viewport);
    }
    return;
  }
  lifecycle.update(viewport);
}

export function WorkspaceCanvasAdapter<TSectionData = WorkspaceJsonValue>({
  ariaLabel,
  appearance,
  controllerSynchronizationRevision,
  document,
  emptyState,
  gestureOptions,
  gridOptions,
  layoutEditable,
  marqueeSelectionMode,
  minimapPlacement,
  minimapVisible,
  onCanvasControllerChange,
  onGridSnapChange,
  onMinimapVisibilityChange,
  onRootMoveCommit,
  onSectionPresentationCommit,
  onSectionTitleCommit,
  onSelectionChange,
  onViewportCommit,
  overlaySlots,
  presentationEditable,
  readOnly,
  sectionColorPalette,
  sectionRegistry,
  selectedSectionIds,
  toolbarControls,
  validateSectionTitle,
  workspaceController,
}: WorkspaceCanvasAdapterProps<TSectionData>) {
  const reactId = useId();
  const canvasId = `setta-workspace-canvas-${reactId.replaceAll(":", "")}`;
  const minimapId = `${canvasId}-minimap`;
  const geometryIndex = useMemo(() => new WorkspaceGeometryIndex(), []);
  const geometryRef = useRef<WorkspaceGeometryMeasurements | null>(null);
  geometryRef.current ??= new WorkspaceGeometryMeasurements(geometryIndex, document.viewport);
  const geometry = geometryRef.current;
  const gestureOptionsRef = useRef(gestureOptions);
  gestureOptionsRef.current = gestureOptions;
  const documentRef = useRef(document);
  const gridOptionsRef = useRef(gridOptions);
  const onRootMoveCommitRef = useRef(onRootMoveCommit);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const selectedSectionIdsRef = useRef<readonly string[]>(selectedSectionIds);
  documentRef.current = document;
  gridOptionsRef.current = gridOptions;
  onRootMoveCommitRef.current = onRootMoveCommit;
  onSelectionChangeRef.current = onSelectionChange;
  selectedSectionIdsRef.current = selectedSectionIds;
  const [movementAnnouncementText, setMovementAnnouncementText] = useState("");
  const [selectionAnnouncementText, setSelectionAnnouncementText] = useState("");
  const [projectionSynchronizationRevision, setProjectionSynchronizationRevision] = useState(0);
  const pendingRootMovementRef = useRef<PendingRootMovement | null>(null);
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
        setMovementAnnouncementText(movementAnnouncement(title, position, result, sectionCount));
      }
      setProjectionSynchronizationRevision((revision) => revision + 1);
    },
    [],
  );
  const commitSelection = useCallback((sectionIds: readonly string[]) => {
    const result = onSelectionChangeRef.current(sectionIds);
    if (result.status !== "rejected") {
      selectedSectionIdsRef.current = sectionIds;
      setSelectionAnnouncementText(selectionAnnouncement(documentRef.current, sectionIds));
    }
    return result;
  }, []);
  const handleSelectionRequest = useCallback(
    (sectionId: string, request: WorkspaceSectionSelectionRequest) => {
      const nextSelection = applyWorkspaceSectionSelectionRequest(
        documentRef.current,
        selectedSectionIdsRef.current,
        sectionId,
        request,
      );
      commitSelection(nextSelection);
    },
    [commitSelection],
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
        setMovementAnnouncementText(selection.reason);
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
    [commitSelection, recordMovementResult],
  );
  const canvasController = useMemo(
    () =>
      createWorkspaceCanvasController(geometry, () => ({
        maxZoom: gestureOptionsRef.current.maxZoom,
        minZoom: gestureOptionsRef.current.minZoom,
      })),
    [geometry],
  );
  const rootSelectionProjection = useMemo<RootSelectionProjection>(() => {
    const selectedIds = new Set(selectedSectionIds);
    const activeSelectedRoot = document.rootSections.find(({ sectionId }) =>
      selectedIds.has(sectionId),
    );
    const movement = activeSelectedRoot
      ? resolveWorkspaceRootSelection(document, selectedSectionIds, activeSelectedRoot.sectionId)
      : null;
    return {
      movementBlocked: movement !== null && !movement.allowed,
      selectedSectionIds: selectedIds,
    };
  }, [document, selectedSectionIds]);
  const projectedNodes = useMemo(
    () =>
      projectNodes(
        document,
        geometry,
        sectionRegistry,
        sectionColorPalette,
        appearance,
        readOnly,
        layoutEditable,
        presentationEditable,
        handleKeyboardMove,
        onSectionPresentationCommit,
        handleSelectionRequest,
        onSectionTitleCommit,
        validateSectionTitle,
        rootSelectionProjection,
      ),
    [
      appearance,
      document,
      geometry,
      handleKeyboardMove,
      handleSelectionRequest,
      layoutEditable,
      onSectionPresentationCommit,
      onSectionTitleCommit,
      presentationEditable,
      readOnly,
      rootSelectionProjection,
      sectionColorPalette,
      sectionRegistry,
      validateSectionTitle,
    ],
  );
  const [nodes, setNodes] = useState<WorkspaceRootNode[]>(projectedNodes);
  const rootProjectionRef = useRef<TransientRootProjection | null>(null);
  rootProjectionRef.current ??= new TransientRootProjection(
    rootProjectionInputs(projectedNodes),
    document.viewport,
  );
  const rootProjection = rootProjectionRef.current;
  const activeRootMoveRef = useRef<ActiveRootMovement | null>(null);
  const [canvasInitialized, setCanvasInitialized] = useState(false);
  const lifecycleRef = useRef<WorkspaceViewportLifecycle | null>(null);
  lifecycleRef.current ??= new WorkspaceViewportLifecycle(document.viewport);
  const lifecycle = lifecycleRef.current;
  const programmaticViewportRef = useRef<WorkspaceViewport | null>(null);
  const canvasMountedRef = useRef(false);
  const canvasGesturePolicy = useMemo(
    () => createWorkspaceCanvasGesturePolicy(gestureOptions),
    [gestureOptions],
  );
  const snapGrid = useMemo<[number, number]>(
    () => [gridOptions.spacing[0], gridOptions.spacing[1]],
    [gridOptions.spacing],
  );
  const sectionIds = useMemo(
    () => document.rootSections.map((root) => root.sectionId),
    [document.rootSections],
  );
  const marqueeSelection = useWorkspaceMarqueeSelection({
    geometry,
    geometryIndex,
    mode: marqueeSelectionMode,
    onSelectionChange: commitSelection,
    selectedSectionIds: selectedSectionIdsRef,
  });
  const cancelMarqueeSelection = marqueeSelection.cancel;
  const handleCanvasInitialized = useCallback(() => setCanvasInitialized(true), []);
  const getCanvasBounds = useCallback(() => geometry.canvasBounds(), [geometry]);
  const handlePaneClick = useCallback(() => {
    commitSelection([]);
  }, [commitSelection]);
  const handleNodeClick = useCallback<NodeMouseHandler<WorkspaceRootNode>>(
    (event, node) => {
      const ElementConstructor = event.currentTarget.ownerDocument.defaultView?.Element;
      const target = event.target;
      if (
        ElementConstructor &&
        target instanceof ElementConstructor &&
        target.closest(".setta-workspace__section-drag-handle, [data-workspace-selection-control]")
      ) {
        return;
      }
      handleSelectionRequest(node.id, {
        additive: event.shiftKey,
        preserveSelected: false,
      });
    },
    [handleSelectionRequest],
  );
  const handleCanvasKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!targetAcceptsCanvasShortcut(event.target, event.currentTarget.ownerDocument)) {
        return;
      }
      const selectsAll =
        event.key.toLowerCase() === "a" && (event.ctrlKey || event.metaKey) && !event.altKey;
      const clearsSelection = event.key === "Escape" && selectedSectionIdsRef.current.length > 0;
      if (!selectsAll && !clearsSelection) {
        return;
      }
      commitSelection(
        selectsAll ? documentRef.current.rootSections.map(({ sectionId }) => sectionId) : [],
      );
      event.preventDefault();
      event.stopPropagation();
    },
    [commitSelection],
  );

  useEffect(() => {
    activeRootMoveRef.current = null;
    rootProjection.synchronizeRoots(rootProjectionInputs(projectedNodes));
    setNodes((current) => synchronizeNodes(current, projectedNodes));
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
      setMovementAnnouncementText(
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
    document.rootSections,
    geometry,
    projectedNodes,
    projectionSynchronizationRevision,
    rootProjection,
  ]);

  useEffect(() => {
    if (!canvasInitialized) {
      return;
    }
    onCanvasControllerChange(canvasController);
    return () => onCanvasControllerChange(null);
  }, [canvasController, canvasInitialized, onCanvasControllerChange]);

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
        setMovementAnnouncementText(selection.reason);
        return;
      }
      const draggedIds = new Set(draggedNodes.map(({ id }) => id));
      if (selection.block.sectionIds.some((sectionId) => !draggedIds.has(sectionId))) {
        activeRootMoveRef.current = null;
        setMovementAnnouncementText("Unable to move the complete selected section block.");
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
      setMovementAnnouncementText(`Moving ${node.data.title}${suffix}.`);
    },
    [commitSelection, rootProjection],
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
        setMovementAnnouncementText(`${node.data.title}${suffix} stayed in place.`);
        return;
      }
      const result = onRootMoveCommitRef.current(command.positions);
      recordMovementResult(node.id, node.data.title, command.positions, result);
    },
    [projectedNodes, recordMovementResult, rootProjection],
  );
  const handleCanvasElement = useCallback(
    (element: HTMLDivElement | null) => {
      canvasMountedRef.current = element !== null;
      if (!element) {
        cancelMarqueeSelection();
        rootProjection.cancelRootGesture();
        activeRootMoveRef.current = null;
        const baseline = lifecycle.cancel();
        if (baseline) {
          geometry.setViewport(baseline);
        }
        programmaticViewportRef.current = null;
      }
      geometry.setCanvasElement(element);
    },
    [cancelMarqueeSelection, geometry, lifecycle, rootProjection],
  );
  const handleMoveStart = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (!canvasMountedRef.current) {
        return;
      }
      if (event) {
        programmaticViewportRef.current = null;
      }
      const nextViewport = viewportFromUpstream(viewport);
      geometry.setViewport(nextViewport);
      advanceViewportLifecycle(
        lifecycle,
        nextViewport,
        programmaticViewportRef.current,
        event,
        "begin",
      );
    },
    [geometry, lifecycle],
  );
  const handleMove = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (!canvasMountedRef.current) {
        return;
      }
      const nextViewport = viewportFromUpstream(viewport);
      geometry.setViewport(nextViewport);
      advanceViewportLifecycle(
        lifecycle,
        nextViewport,
        programmaticViewportRef.current,
        event,
        "update",
      );
    },
    [geometry, lifecycle],
  );
  const handleMoveEnd = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (!canvasMountedRef.current) {
        return;
      }
      const nextViewport = viewportFromUpstream(viewport);
      if (!event) {
        if (
          workspaceViewportsMatch(programmaticViewportRef.current ?? nextViewport, nextViewport)
        ) {
          if (!lifecycle.isActive()) {
            geometry.completeViewport(nextViewport);
            lifecycle.synchronize(nextViewport);
          }
          programmaticViewportRef.current = null;
        }
        return;
      }
      if (!workspaceViewportsMatch(lifecycle.current(), nextViewport)) {
        return;
      }
      geometry.setViewport(nextViewport);
      const completed = lifecycle.complete(nextViewport);
      if (completed) {
        onViewportCommit(completed);
      }
    },
    [geometry, lifecycle, onViewportCommit],
  );

  return (
    <ReactFlow<WorkspaceRootNode>
      aria-label={`${ariaLabel} canvas`}
      aria-keyshortcuts="Control+A Meta+A Escape"
      autoPanOnNodeFocus={false}
      className="setta-workspace__canvas"
      data-workspace-grid-pattern={gridOptions.pattern}
      data-workspace-grid-snap={gridOptions.snap ? "true" : "false"}
      data-workspace-grid-spacing={gridOptions.spacing.join(" ")}
      data-workspace-grid-visible={gridOptions.visible ? "true" : "false"}
      data-workspace-marquee-active={marqueeSelection.active ? "true" : "false"}
      data-workspace-marquee-mode={marqueeSelectionMode}
      data-workspace-pan-on-scroll-mode={gestureOptions.panOnScrollMode}
      data-workspace-pan-on-scroll-speed={gestureOptions.panOnScrollSpeed}
      defaultViewport={document.viewport}
      deleteKeyCode={null}
      disableKeyboardA11y
      edges={[]}
      edgesFocusable={false}
      elementsSelectable={false}
      elevateNodesOnSelect={false}
      id={canvasId}
      maxZoom={canvasGesturePolicy.maxZoom}
      minZoom={canvasGesturePolicy.minZoom}
      multiSelectionKeyCode={null}
      noPanClassName={WORKSPACE_NO_PAN_CLASS_NAME}
      noWheelClassName={WORKSPACE_NO_WHEEL_CLASS_NAME}
      nodeTypes={workspaceNodeTypes}
      nodes={nodes}
      nodesConnectable={false}
      nodesDraggable
      nodesFocusable={false}
      onInit={handleCanvasInitialized}
      onMove={handleMove}
      onMoveEnd={handleMoveEnd}
      onMoveStart={handleMoveStart}
      onNodeClick={handleNodeClick}
      onNodeDragStart={handleNodeDragStart}
      onNodeDragStop={handleNodeDragStop}
      onNodesChange={handleNodesChange}
      onPaneClick={handlePaneClick}
      onPointerCancel={marqueeSelection.onPointerCancel}
      onPointerDownCapture={marqueeSelection.onPointerDownCapture}
      onPointerMove={marqueeSelection.onPointerMove}
      onPointerUp={marqueeSelection.onPointerUp}
      onKeyDownCapture={handleCanvasKeyDownCapture}
      panActivationKeyCode={canvasGesturePolicy.panActivationKeyCode}
      panOnDrag={canvasGesturePolicy.panOnDrag}
      panOnScroll={canvasGesturePolicy.panOnScroll}
      panOnScrollMode={canvasGesturePolicy.panOnScrollMode}
      panOnScrollSpeed={canvasGesturePolicy.panOnScrollSpeed}
      preventScrolling={canvasGesturePolicy.preventScrolling}
      proOptions={{ hideAttribution: false }}
      ref={handleCanvasElement}
      selectionKeyCode={null}
      selectionOnDrag={false}
      snapGrid={snapGrid}
      snapToGrid={gridOptions.snap}
      zoomActivationKeyCode={canvasGesturePolicy.zoomActivationKeyCode}
      zoomOnDoubleClick={canvasGesturePolicy.zoomOnDoubleClick}
      zoomOnPinch={canvasGesturePolicy.zoomOnPinch}
      zoomOnScroll={canvasGesturePolicy.zoomOnScroll}
    >
      {gridOptions.visible ? (
        <WorkspaceGridBackground
          canvasId={canvasId}
          gridOptions={gridOptions}
          snapGrid={snapGrid}
        />
      ) : null}
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-movement-announcement=""
      >
        {movementAnnouncementText}
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-selection-announcement=""
      >
        {selectionAnnouncementText}
      </div>
      <WorkspaceSelectionOverlay
        geometryIndex={geometryIndex}
        selectedSectionIds={selectedSectionIds}
      />
      {marqueeSelection.overlay}
      {hasOverlayContent(overlaySlots.canvas) ? (
        <ViewportPortal>
          <div className="setta-workspace__host-overlay" data-workspace-overlay-placement="canvas">
            {overlaySlots.canvas}
          </div>
        </ViewportPortal>
      ) : null}
      <div
        className={`setta-workspace__empty-panel ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
        hidden={!hasOverlayContent(emptyState)}
      >
        <div className="setta-workspace__empty">{emptyState}</div>
      </div>
      <WorkspaceFixedOverlay placement="project">{overlaySlots.project}</WorkspaceFixedOverlay>
      <WorkspaceFixedOverlay placement="utility">{overlaySlots.utility}</WorkspaceFixedOverlay>
      <WorkspaceFixedOverlay placement="viewport">{overlaySlots.viewport}</WorkspaceFixedOverlay>
      <WorkspaceToolbar
        ariaLabel={ariaLabel}
        canonicalViewport={document.viewport}
        controller={workspaceController}
        gestureOptions={gestureOptions}
        getCanvasBounds={getCanvasBounds}
        gridSnap={gridOptions.snap}
        minimapId={minimapId}
        minimapVisible={minimapVisible}
        onGridSnapChange={onGridSnapChange}
        onMinimapVisibilityChange={onMinimapVisibilityChange}
        sectionIds={sectionIds}
        toolbarControls={toolbarControls}
      />
      <WorkspaceMinimap
        ariaLabel={ariaLabel}
        id={minimapId}
        placement={minimapPlacement}
        visible={minimapVisible}
      />
      <WorkspaceViewportSynchronizer
        geometry={geometry}
        lifecycle={lifecycle}
        programmaticViewportRef={programmaticViewportRef}
        synchronizationRevision={controllerSynchronizationRevision}
        viewport={document.viewport}
      />
    </ReactFlow>
  );
}
