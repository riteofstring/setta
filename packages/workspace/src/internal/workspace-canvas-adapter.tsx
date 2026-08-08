import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useViewport,
  ViewportPortal,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type OnNodeDrag,
  type OnNodesChange,
  type Viewport,
} from "@xyflow/react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  WorkspaceActionResult,
  WorkspaceController,
  WorkspaceDocument,
  WorkspaceGestureOptions,
  WorkspaceJsonValue,
  WorkspacePoint,
  WorkspaceSection,
  WorkspaceViewport,
} from "../core.js";
import type {
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
  WorkspaceToolbarControl,
} from "../react.js";
import { WorkspaceGeometryIndex } from "./geometry-index.js";
import {
  TransientRootProjection,
  type RootProjectionChange,
  type RootProjectionInput,
} from "./transient-root-projection.js";
import { createWorkspaceCanvasGesturePolicy } from "./workspace-canvas-gesture-policy.js";
import { projectWorkspaceCanvasRoots, type WorkspaceCanvasRoot } from "./workspace-canvas-model.js";
import {
  createWorkspaceCanvasController,
  type WorkspaceCanvasController,
} from "./workspace-canvas-navigation.js";
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
import { WorkspaceSectionFrame } from "./workspace-section-frame.js";
import type {
  ResolvedSectionDefinition,
  WorkspaceSectionRegistry,
} from "./workspace-section-registry.js";
import { WorkspaceToolbar } from "./workspace-toolbar.js";
import { WorkspaceViewportLifecycle } from "./workspace-viewport-lifecycle.js";
import {
  workspaceViewportsMatch,
  WorkspaceViewportSynchronizer,
} from "./workspace-viewport-synchronizer.js";

type WorkspaceRootNodeData = {
  appearance: "dark" | "light";
  definition: ResolvedSectionDefinition<unknown>;
  geometry: WorkspaceGeometryMeasurements;
  layoutEditable: boolean;
  moving: boolean;
  onKeyboardMove(sectionId: string, direction: WorkspaceKeyboardMoveDirection): void;
  order: number;
  readOnly: boolean;
  section: WorkspaceSection<unknown>;
  sectionId: string;
  title: string;
};

type WorkspaceRootNode = Node<WorkspaceRootNodeData, "workspace-root-shell">;

type PendingRootMovement = Readonly<{
  position: WorkspacePoint;
  sectionId: string;
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
  minimapPlacement: WorkspaceMinimapPlacement;
  minimapVisible: boolean;
  onCanvasControllerChange(controller: WorkspaceCanvasController | null): void;
  onGridSnapChange(value: boolean): void;
  onMinimapVisibilityChange(value: boolean): void;
  onRootMoveCommit(positions: Readonly<Record<string, WorkspacePoint>>): WorkspaceActionResult;
  onViewportCommit(viewport: WorkspaceViewport): void;
  overlaySlots: Partial<Record<WorkspaceOverlayPlacement, ReactNode>>;
  readOnly: boolean;
  sectionRegistry: WorkspaceSectionRegistry<TSectionData>;
  toolbarControls: readonly WorkspaceToolbarControl<TSectionData>[];
  workspaceController: WorkspaceController<TSectionData>;
}>;

function WorkspaceRootShell({ data }: NodeProps<WorkspaceRootNode>) {
  return (
    <WorkspaceSectionFrame
      appearance={data.appearance}
      definition={data.definition}
      geometry={data.geometry}
      layoutEditable={data.layoutEditable}
      moving={data.moving}
      onKeyboardMove={data.onKeyboardMove}
      order={data.order}
      readOnly={data.readOnly}
      section={data.section}
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
const workspaceNodeTypes = {
  "workspace-root-shell": MemoizedWorkspaceRootShell,
} satisfies NodeTypes;

function rootNode(
  root: WorkspaceCanvasRoot,
  geometry: WorkspaceGeometryMeasurements,
  section: WorkspaceSection<unknown>,
  definition: ResolvedSectionDefinition<unknown>,
  appearance: "dark" | "light",
  readOnly: boolean,
  layoutEditable: boolean,
  onKeyboardMove: WorkspaceRootNodeData["onKeyboardMove"],
): WorkspaceRootNode {
  return {
    ariaLabel: root.title,
    data: {
      appearance,
      definition,
      geometry,
      layoutEditable,
      moving: false,
      onKeyboardMove,
      order: root.order,
      readOnly,
      section,
      sectionId: root.sectionId,
      title: root.title,
    },
    dragHandle: ".setta-workspace__section-drag-handle",
    draggable: layoutEditable && !section.positionAndSizeLocked,
    focusable: false,
    height: root.size.height,
    id: root.sectionId,
    position: { ...root.position },
    selectable: false,
    type: "workspace-root-shell",
    width: root.size.width,
    zIndex: root.order,
  };
}

function projectNodes<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  geometry: WorkspaceGeometryMeasurements,
  sectionRegistry: WorkspaceSectionRegistry<TSectionData>,
  appearance: "dark" | "light",
  readOnly: boolean,
  layoutEditable: boolean,
  onKeyboardMove: WorkspaceRootNodeData["onKeyboardMove"],
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
      appearance,
      readOnly,
      layoutEditable,
      onKeyboardMove,
    );
  });
}

function synchronizeNodes(
  current: readonly WorkspaceRootNode[],
  projected: readonly WorkspaceRootNode[],
): WorkspaceRootNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  return projected.map((node) => {
    const existing = currentById.get(node.id);
    return existing
      ? {
          ...existing,
          ...node,
          data: node.data,
          position: { ...node.position },
        }
      : node;
  });
}

function rootProjectionInputs(nodes: readonly WorkspaceRootNode[]): readonly RootProjectionInput[] {
  return nodes.map((node) => ({
    position: { ...node.position },
    sectionId: node.id,
    size: {
      height: node.data.section.size.height.value,
      width: node.data.section.size.width.value,
    },
  }));
}

function rootProjectionChange(change: NodeChange<WorkspaceRootNode>): RootProjectionChange | null {
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

function setActiveRoot(
  nodes: readonly WorkspaceRootNode[],
  activeSectionId: string | null,
): WorkspaceRootNode[] {
  return nodes.map((node) => {
    const moving = node.id === activeSectionId;
    const zIndex = moving ? nodes.length : node.data.order;
    if (node.data.moving === moving && node.zIndex === zIndex) {
      return node;
    }
    return { ...node, data: { ...node.data, moving }, zIndex };
  });
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
): string {
  if (result.status === "applied") {
    return `${title} moved to ${String(position.x)}, ${String(position.y)}.`;
  }
  if ("reason" in result) {
    return rejectedMovementAnnouncement(title, result.reason);
  }
  return `${title} stayed in place.`;
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
          nodeColor="var(--setta-workspace-section-background)"
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
  minimapPlacement,
  minimapVisible,
  onCanvasControllerChange,
  onGridSnapChange,
  onMinimapVisibilityChange,
  onRootMoveCommit,
  onViewportCommit,
  overlaySlots,
  readOnly,
  sectionRegistry,
  toolbarControls,
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
  documentRef.current = document;
  gridOptionsRef.current = gridOptions;
  onRootMoveCommitRef.current = onRootMoveCommit;
  const [movementAnnouncementText, setMovementAnnouncementText] = useState("");
  const [projectionSynchronizationRevision, setProjectionSynchronizationRevision] = useState(0);
  const pendingRootMovementRef = useRef<PendingRootMovement | null>(null);
  const recordMovementResult = useCallback(
    (sectionId: string, title: string, position: WorkspacePoint, result: WorkspaceActionResult) => {
      if (result.status === "applied") {
        pendingRootMovementRef.current = { position, sectionId, title };
      } else {
        setMovementAnnouncementText(movementAnnouncement(title, position, result));
      }
      setProjectionSynchronizationRevision((revision) => revision + 1);
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
      const position = moveWorkspaceRootWithKeyboard(
        root.position,
        direction,
        gridOptionsRef.current,
      );
      const positions = Object.fromEntries([[sectionId, position]]);
      const result = onRootMoveCommitRef.current(positions);
      recordMovementResult(sectionId, section.title, position, result);
    },
    [recordMovementResult],
  );
  const canvasController = useMemo(
    () =>
      createWorkspaceCanvasController(geometry, () => ({
        maxZoom: gestureOptionsRef.current.maxZoom,
        minZoom: gestureOptionsRef.current.minZoom,
      })),
    [geometry],
  );
  const projectedNodes = useMemo(
    () =>
      projectNodes(
        document,
        geometry,
        sectionRegistry,
        appearance,
        readOnly,
        layoutEditable,
        handleKeyboardMove,
      ),
    [appearance, document, geometry, handleKeyboardMove, layoutEditable, readOnly, sectionRegistry],
  );
  const [nodes, setNodes] = useState<WorkspaceRootNode[]>(projectedNodes);
  const rootProjectionRef = useRef<TransientRootProjection | null>(null);
  rootProjectionRef.current ??= new TransientRootProjection(
    rootProjectionInputs(projectedNodes),
    document.viewport,
  );
  const rootProjection = rootProjectionRef.current;
  const activeRootMoveRef = useRef<string | null>(null);
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
  const handleCanvasInitialized = useCallback(() => setCanvasInitialized(true), []);
  const getCanvasBounds = useCallback(() => geometry.canvasBounds(), [geometry]);

  useEffect(() => {
    activeRootMoveRef.current = null;
    rootProjection.synchronizeRoots(rootProjectionInputs(projectedNodes));
    setNodes((current) => synchronizeNodes(current, projectedNodes));
    const pendingMovement = pendingRootMovementRef.current;
    if (pendingMovement) {
      const canonicalRoot = document.rootSections.find(
        ({ sectionId }) => sectionId === pendingMovement.sectionId,
      );
      const accepted =
        canonicalRoot?.position.x === pendingMovement.position.x &&
        canonicalRoot.position.y === pendingMovement.position.y;
      setMovementAnnouncementText(
        accepted
          ? movementAnnouncement(pendingMovement.title, pendingMovement.position, {
              status: "applied",
            })
          : `${pendingMovement.title} stayed in place.`,
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
      const projectionChanges = changes
        .map(rootProjectionChange)
        .filter((change): change is RootProjectionChange => change !== null);
      if (projectionChanges.length > 0) {
        rootProjection.applyRootChanges(projectionChanges);
      }
      setNodes((current) => applyNodeChanges(changes, current));
      geometry.requestMeasurement();
    },
    [geometry, rootProjection],
  );
  const handleNodeDragStart = useCallback<OnNodeDrag<WorkspaceRootNode>>(
    (_event, node) => {
      if (!node.draggable) {
        return;
      }
      rootProjection.beginRootMove([node.id]);
      activeRootMoveRef.current = node.id;
      setNodes((current) => setActiveRoot(current, node.id));
      setMovementAnnouncementText(`Moving ${node.data.title}.`);
    },
    [rootProjection],
  );
  const handleNodeDragStop = useCallback<OnNodeDrag<WorkspaceRootNode>>(
    (_event, node) => {
      if (activeRootMoveRef.current !== node.id) {
        return;
      }
      rootProjection.applyRootChanges([
        {
          dragging: false,
          position: { ...node.position },
          sectionId: node.id,
          type: "position",
        },
      ]);
      const command = rootProjection.completeRootGesture();
      activeRootMoveRef.current = null;
      setNodes((current) => setActiveRoot(current, null));
      if (!command || command.type !== "move-root-sections") {
        setMovementAnnouncementText(`${node.data.title} stayed in place.`);
        return;
      }
      const position = command.positions[node.id] ?? node.position;
      const result = onRootMoveCommitRef.current(command.positions);
      recordMovementResult(node.id, node.data.title, position, result);
    },
    [recordMovementResult, rootProjection],
  );
  const handleCanvasElement = useCallback(
    (element: HTMLDivElement | null) => {
      canvasMountedRef.current = element !== null;
      if (!element) {
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
    [geometry, lifecycle, rootProjection],
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
      autoPanOnNodeFocus={false}
      className="setta-workspace__canvas"
      data-workspace-grid-pattern={gridOptions.pattern}
      data-workspace-grid-snap={gridOptions.snap ? "true" : "false"}
      data-workspace-grid-spacing={gridOptions.spacing.join(" ")}
      data-workspace-grid-visible={gridOptions.visible ? "true" : "false"}
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
      onNodeDragStart={handleNodeDragStart}
      onNodeDragStop={handleNodeDragStop}
      onNodesChange={handleNodesChange}
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
