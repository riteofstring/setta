import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Panel,
  PanOnScrollMode,
  ReactFlow,
  useReactFlow,
  useStore,
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
  type MutableRefObject,
  type ReactNode,
} from "react";

import type {
  WorkspaceDocument,
  WorkspaceGestureOptions,
  WorkspaceJsonValue,
  WorkspacePanOnScrollMode,
  WorkspaceViewport,
} from "../core.js";
import { WorkspaceGeometryIndex } from "./geometry-index.js";
import { projectWorkspaceCanvasRoots, type WorkspaceCanvasRoot } from "./workspace-canvas-model.js";
import {
  createWorkspaceCanvasController,
  type WorkspaceCanvasController,
} from "./workspace-canvas-navigation.js";
import { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import { WorkspaceViewportLifecycle } from "./workspace-viewport-lifecycle.js";

export const WORKSPACE_NO_PAN_CLASS_NAME = "setta-workspace-internal-no-pan";
export const WORKSPACE_NO_WHEEL_CLASS_NAME = "setta-workspace-internal-no-wheel";

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
  onCanvasControllerChange(controller: WorkspaceCanvasController | null): void;
  onViewportCommit(viewport: WorkspaceViewport): void;
  overlay: ReactNode;
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

function panOnScrollMode(mode: WorkspacePanOnScrollMode): PanOnScrollMode {
  if (mode === "horizontal") {
    return PanOnScrollMode.Horizontal;
  }
  if (mode === "vertical") {
    return PanOnScrollMode.Vertical;
  }
  return PanOnScrollMode.Free;
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
  const zoom = useStore((state) => state.transform[2]);
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

function mutableKeyCode(
  value: WorkspaceGestureOptions["panActivationKey"],
): string | string[] | null {
  return value === null || typeof value === "string" ? value : [...value];
}

function mutablePanOnDrag(value: WorkspaceGestureOptions["panOnDrag"]): boolean | number[] {
  return typeof value === "boolean" ? value : [...value];
}

function viewportsMatch(first: WorkspaceViewport, second: WorkspaceViewport): boolean {
  return first.x === second.x && first.y === second.y && first.zoom === second.zoom;
}

function WorkspaceViewportSynchronizer({
  geometry,
  lifecycle,
  programmaticViewportRef,
  viewport,
}: Readonly<{
  geometry: WorkspaceGeometryMeasurements;
  lifecycle: WorkspaceViewportLifecycle;
  programmaticViewportRef: MutableRefObject<WorkspaceViewport | null>;
  viewport: WorkspaceViewport;
}>) {
  const instance = useReactFlow<WorkspaceRootNode>();

  useEffect(() => {
    const maySynchronize = lifecycle.synchronize(viewport);
    if (!maySynchronize || !instance.viewportInitialized) {
      return;
    }
    const current = instance.getViewport();
    if (viewportsMatch(current, viewport)) {
      geometry.completeViewport(viewport);
      return;
    }
    programmaticViewportRef.current = viewport;
    void instance.setViewport(viewport).then(() => {
      lifecycle.complete(viewport);
      geometry.completeViewport(viewport);
      geometry.flushMeasurement();
      programmaticViewportRef.current = null;
    });
  }, [geometry, instance, lifecycle, programmaticViewportRef, viewport]);

  return null;
}

function viewportFromUpstream(viewport: Viewport): WorkspaceViewport {
  return { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
}

export function WorkspaceCanvasAdapter<TSectionData = WorkspaceJsonValue>({
  ariaLabel,
  document,
  emptyState,
  gestureOptions,
  gridOptions,
  onCanvasControllerChange,
  onViewportCommit,
  overlay,
}: WorkspaceCanvasAdapterProps<TSectionData>) {
  const reactId = useId();
  const canvasId = `setta-workspace-canvas-${reactId.replaceAll(":", "")}`;
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
  const lifecycleRef = useRef<WorkspaceViewportLifecycle | null>(null);
  lifecycleRef.current ??= new WorkspaceViewportLifecycle(document.viewport);
  const lifecycle = lifecycleRef.current;
  const programmaticViewportRef = useRef<WorkspaceViewport | null>(null);
  const snapGrid = useMemo<[number, number]>(
    () => [gridOptions.spacing[0], gridOptions.spacing[1]],
    [gridOptions.spacing],
  );

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
    (element: HTMLDivElement | null) => geometry.setCanvasElement(element),
    [geometry],
  );
  const handleMoveStart = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      const nextViewport = viewportFromUpstream(viewport);
      geometry.setViewport(nextViewport);
      if (programmaticViewportRef.current) {
        lifecycle.synchronize(nextViewport);
      } else {
        lifecycle.begin(nextViewport);
      }
    },
    [geometry, lifecycle],
  );
  const handleMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      const nextViewport = viewportFromUpstream(viewport);
      geometry.setViewport(nextViewport);
      if (programmaticViewportRef.current) {
        lifecycle.synchronize(nextViewport);
      } else {
        lifecycle.update(nextViewport);
      }
    },
    [geometry, lifecycle],
  );
  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      const nextViewport = viewportFromUpstream(viewport);
      geometry.setViewport(nextViewport);
      if (programmaticViewportRef.current) {
        lifecycle.synchronize(nextViewport);
        return;
      }
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
      defaultViewport={document.viewport}
      deleteKeyCode={null}
      disableKeyboardA11y
      edges={[]}
      edgesFocusable={false}
      elementsSelectable={false}
      id={canvasId}
      maxZoom={gestureOptions.maxZoom}
      minZoom={gestureOptions.minZoom}
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
      panActivationKeyCode={mutableKeyCode(gestureOptions.panActivationKey)}
      panOnDrag={mutablePanOnDrag(gestureOptions.panOnDrag)}
      panOnScroll={gestureOptions.panOnScroll}
      panOnScrollMode={panOnScrollMode(gestureOptions.panOnScrollMode)}
      panOnScrollSpeed={gestureOptions.panOnScrollSpeed}
      preventScrolling={gestureOptions.panOnScroll || gestureOptions.zoomOnScroll}
      proOptions={{ hideAttribution: false }}
      ref={handleCanvasElement}
      selectionKeyCode={null}
      selectionOnDrag={false}
      snapGrid={snapGrid}
      snapToGrid={gridOptions.snap}
      zoomActivationKeyCode={mutableKeyCode(gestureOptions.zoomActivationKey)}
      zoomOnDoubleClick={gestureOptions.zoomOnDoubleClick}
      zoomOnPinch={gestureOptions.zoomOnPinch}
      zoomOnScroll={gestureOptions.zoomOnScroll}
    >
      {gridOptions.visible ? (
        <WorkspaceGridBackground
          canvasId={canvasId}
          gridOptions={gridOptions}
          snapGrid={snapGrid}
        />
      ) : null}
      {overlay ? (
        <ViewportPortal>
          <div
            className={`setta-workspace__host-overlay ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
          >
            {overlay}
          </div>
        </ViewportPortal>
      ) : null}
      {emptyState ? (
        <Panel className="setta-workspace__empty-panel" position="bottom-left">
          <p className="setta-workspace__empty">{emptyState}</p>
        </Panel>
      ) : null}
      <WorkspaceViewportSynchronizer
        geometry={geometry}
        lifecycle={lifecycle}
        programmaticViewportRef={programmaticViewportRef}
        viewport={document.viewport}
      />
    </ReactFlow>
  );
}
