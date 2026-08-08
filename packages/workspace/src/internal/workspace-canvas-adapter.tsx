import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useViewport,
  ViewportPortal,
  type Node,
  type NodeProps,
  type NodeTypes,
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
  WorkspaceController,
  WorkspaceDocument,
  WorkspaceGestureOptions,
  WorkspaceJsonValue,
  WorkspaceViewport,
} from "../core.js";
import type {
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
  WorkspaceToolbarControl,
} from "../react.js";
import { WorkspaceGeometryIndex } from "./geometry-index.js";
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
import { WorkspaceToolbar } from "./workspace-toolbar.js";
import { WorkspaceViewportLifecycle } from "./workspace-viewport-lifecycle.js";
import {
  workspaceViewportsMatch,
  WorkspaceViewportSynchronizer,
} from "./workspace-viewport-synchronizer.js";

type WorkspaceRootNodeData = {
  geometry: WorkspaceGeometryMeasurements;
  kind: string;
  order: number;
  sectionId: string;
  title: string;
};

type WorkspaceRootNode = Node<WorkspaceRootNodeData, "workspace-root-shell">;

export type WorkspaceCanvasAdapterProps<TSectionData = WorkspaceJsonValue> = Readonly<{
  ariaLabel: string;
  document: WorkspaceDocument<TSectionData>;
  emptyState: ReactNode;
  gestureOptions: WorkspaceGestureOptions;
  gridOptions: ResolvedWorkspaceGridOptions;
  minimapPlacement: WorkspaceMinimapPlacement;
  minimapVisible: boolean;
  onCanvasControllerChange(controller: WorkspaceCanvasController | null): void;
  onGridSnapChange(value: boolean): void;
  onMinimapVisibilityChange(value: boolean): void;
  onViewportCommit(viewport: WorkspaceViewport): void;
  overlaySlots: Partial<Record<WorkspaceOverlayPlacement, ReactNode>>;
  toolbarControls: readonly WorkspaceToolbarControl<TSectionData>[];
  workspaceController: WorkspaceController<TSectionData>;
}>;

function WorkspaceRootShell({ data }: NodeProps<WorkspaceRootNode>) {
  const registerElement = useCallback(
    (element: HTMLElement | null) => {
      if (!element) {
        return;
      }
      return data.geometry.register({
        depth: 0,
        element,
        order: data.order,
        parentSectionId: null,
        sectionId: data.sectionId,
      });
    },
    [data.geometry, data.order, data.sectionId],
  );

  return (
    <article
      aria-label={data.title}
      className="setta-workspace__root-shell"
      data-workspace-section-id={data.sectionId}
      ref={registerElement}
      tabIndex={-1}
    >
      <h2>{data.title}</h2>
      <p>{data.kind}</p>
    </article>
  );
}

function rootShellPropsMatch(
  left: Readonly<NodeProps<WorkspaceRootNode>>,
  right: Readonly<NodeProps<WorkspaceRootNode>>,
): boolean {
  return (
    left.data.geometry === right.data.geometry &&
    left.data.kind === right.data.kind &&
    left.data.order === right.data.order &&
    left.data.sectionId === right.data.sectionId &&
    left.data.title === right.data.title
  );
}

const MemoizedWorkspaceRootShell = memo(WorkspaceRootShell, rootShellPropsMatch);
const workspaceNodeTypes = {
  "workspace-root-shell": MemoizedWorkspaceRootShell,
} satisfies NodeTypes;

function rootNode(
  root: WorkspaceCanvasRoot,
  geometry: WorkspaceGeometryMeasurements,
): WorkspaceRootNode {
  return {
    ariaLabel: root.title,
    data: {
      geometry,
      kind: root.kind,
      order: root.order,
      sectionId: root.sectionId,
      title: root.title,
    },
    draggable: false,
    focusable: false,
    height: root.size.height,
    id: root.sectionId,
    position: { ...root.position },
    selectable: false,
    type: "workspace-root-shell",
    width: root.size.width,
  };
}

function projectNodes<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  geometry: WorkspaceGeometryMeasurements,
): WorkspaceRootNode[] {
  return projectWorkspaceCanvasRoots(document).map((root) => rootNode(root, geometry));
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
}: Readonly<{
  ariaLabel: string;
  id: string;
  placement: WorkspaceMinimapPlacement;
}>) {
  return (
    <div data-workspace-minimap-placement={placement} id={id}>
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
  document,
  emptyState,
  gestureOptions,
  gridOptions,
  minimapPlacement,
  minimapVisible,
  onCanvasControllerChange,
  onGridSnapChange,
  onMinimapVisibilityChange,
  onViewportCommit,
  overlaySlots,
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
  const canvasController = useMemo(
    () =>
      createWorkspaceCanvasController(geometry, () => ({
        maxZoom: gestureOptionsRef.current.maxZoom,
        minZoom: gestureOptionsRef.current.minZoom,
      })),
    [geometry],
  );
  const projectedNodes = useMemo(() => projectNodes(document, geometry), [document, geometry]);
  const [nodes, setNodes] = useState<WorkspaceRootNode[]>(projectedNodes);
  const [viewportSynchronizationRevision, setViewportSynchronizationRevision] = useState(0);
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
  const getCanvasBounds = useCallback(() => geometry.canvasBounds(), [geometry]);

  useEffect(() => {
    setNodes((current) => synchronizeNodes(current, projectedNodes));
    geometry.requestMeasurement();
  }, [geometry, projectedNodes]);

  useEffect(() => {
    onCanvasControllerChange(canvasController);
    return () => onCanvasControllerChange(null);
  }, [canvasController, onCanvasControllerChange]);

  const handleNodesChange = useCallback<OnNodesChange<WorkspaceRootNode>>(
    (changes) => {
      setNodes((current) => applyNodeChanges(changes, current));
      geometry.requestMeasurement();
    },
    [geometry],
  );
  const handleCanvasElement = useCallback(
    (element: HTMLDivElement | null) => {
      canvasMountedRef.current = element !== null;
      if (!element) {
        const baseline = lifecycle.cancel();
        if (baseline) {
          geometry.setViewport(baseline);
        }
        programmaticViewportRef.current = null;
      }
      geometry.setCanvasElement(element);
    },
    [geometry, lifecycle],
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
      setViewportSynchronizationRevision((current) => current + 1);
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
      id={canvasId}
      maxZoom={canvasGesturePolicy.maxZoom}
      minZoom={canvasGesturePolicy.minZoom}
      multiSelectionKeyCode={null}
      noPanClassName={WORKSPACE_NO_PAN_CLASS_NAME}
      noWheelClassName={WORKSPACE_NO_WHEEL_CLASS_NAME}
      nodeTypes={workspaceNodeTypes}
      nodes={nodes}
      nodesConnectable={false}
      nodesDraggable={false}
      nodesFocusable={false}
      onMove={handleMove}
      onMoveEnd={handleMoveEnd}
      onMoveStart={handleMoveStart}
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
      {minimapVisible ? (
        <WorkspaceMinimap ariaLabel={ariaLabel} id={minimapId} placement={minimapPlacement} />
      ) : null}
      <WorkspaceViewportSynchronizer
        geometry={geometry}
        lifecycle={lifecycle}
        programmaticViewportRef={programmaticViewportRef}
        synchronizationRevision={viewportSynchronizationRevision}
        viewport={document.viewport}
      />
    </ReactFlow>
  );
}
