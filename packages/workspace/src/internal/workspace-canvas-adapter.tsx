import {
  applyNodeChanges,
  Panel,
  PanOnScrollMode,
  ReactFlow,
  useReactFlow,
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
  WorkspaceDocument,
  WorkspaceGestureOptions,
  WorkspaceJsonValue,
  WorkspacePanOnScrollMode,
  WorkspaceViewport,
} from "../core.js";
import { projectWorkspaceCanvasRoots, type WorkspaceCanvasRoot } from "./workspace-canvas-model.js";
import { WorkspaceViewportLifecycle } from "./workspace-viewport-lifecycle.js";

export const WORKSPACE_NO_PAN_CLASS_NAME = "setta-workspace-internal-no-pan";
export const WORKSPACE_NO_WHEEL_CLASS_NAME = "setta-workspace-internal-no-wheel";

type WorkspaceRootNodeData = {
  kind: string;
  sectionId: string;
  title: string;
};

type WorkspaceRootNode = Node<WorkspaceRootNodeData, "workspace-root-shell">;

export type WorkspaceCanvasAdapterProps<TSectionData = WorkspaceJsonValue> = Readonly<{
  ariaLabel: string;
  document: WorkspaceDocument<TSectionData>;
  emptyState: ReactNode;
  gestureOptions: WorkspaceGestureOptions;
  onViewportCommit(viewport: WorkspaceViewport): void;
  overlay: ReactNode;
}>;

function WorkspaceRootShell({ data }: NodeProps<WorkspaceRootNode>) {
  return (
    <article
      aria-label={data.title}
      className="setta-workspace__root-shell"
      data-workspace-section-id={data.sectionId}
    >
      <h2>{data.title}</h2>
      <p>{data.kind}</p>
    </article>
  );
}

const MemoizedWorkspaceRootShell = memo(WorkspaceRootShell);
const workspaceNodeTypes = {
  "workspace-root-shell": MemoizedWorkspaceRootShell,
} satisfies NodeTypes;

function rootNode(root: WorkspaceCanvasRoot): WorkspaceRootNode {
  return {
    ariaLabel: root.title,
    data: {
      kind: root.kind,
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
): WorkspaceRootNode[] {
  return projectWorkspaceCanvasRoots(document).map(rootNode);
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
  lifecycle,
  viewport,
}: Readonly<{
  lifecycle: WorkspaceViewportLifecycle;
  viewport: WorkspaceViewport;
}>) {
  const instance = useReactFlow<WorkspaceRootNode>();

  useEffect(() => {
    const maySynchronize = lifecycle.synchronize(viewport);
    if (!maySynchronize || !instance.viewportInitialized) {
      return;
    }
    const current = instance.getViewport();
    if (!viewportsMatch(current, viewport)) {
      void instance.setViewport(viewport);
    }
  }, [instance, lifecycle, viewport]);

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
  onViewportCommit,
  overlay,
}: WorkspaceCanvasAdapterProps<TSectionData>) {
  const reactId = useId();
  const canvasId = `setta-workspace-canvas-${reactId.replaceAll(":", "")}`;
  const projectedNodes = useMemo(() => projectNodes(document), [document]);
  const [nodes, setNodes] = useState<WorkspaceRootNode[]>(projectedNodes);
  const lifecycleRef = useRef<WorkspaceViewportLifecycle | null>(null);
  lifecycleRef.current ??= new WorkspaceViewportLifecycle(document.viewport);
  const lifecycle = lifecycleRef.current;

  useEffect(() => {
    setNodes((current) => synchronizeNodes(current, projectedNodes));
  }, [projectedNodes]);

  const handleNodesChange = useCallback<OnNodesChange<WorkspaceRootNode>>((changes) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);
  const handleMoveStart = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      lifecycle.begin(viewportFromUpstream(viewport));
    },
    [lifecycle],
  );
  const handleMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      lifecycle.update(viewportFromUpstream(viewport));
    },
    [lifecycle],
  );
  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      const completed = lifecycle.complete(viewportFromUpstream(viewport));
      if (completed) {
        onViewportCommit(completed);
      }
    },
    [lifecycle, onViewportCommit],
  );

  return (
    <ReactFlow<WorkspaceRootNode>
      aria-label={`${ariaLabel} canvas`}
      autoPanOnNodeFocus={false}
      className="setta-workspace__canvas"
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
      selectionKeyCode={null}
      selectionOnDrag={false}
      zoomActivationKeyCode={mutableKeyCode(gestureOptions.zoomActivationKey)}
      zoomOnDoubleClick={gestureOptions.zoomOnDoubleClick}
      zoomOnPinch={gestureOptions.zoomOnPinch}
      zoomOnScroll={gestureOptions.zoomOnScroll}
    >
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
      <WorkspaceViewportSynchronizer lifecycle={lifecycle} viewport={document.viewport} />
    </ReactFlow>
  );
}
