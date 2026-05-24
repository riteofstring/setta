import {
  useMemo,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";

import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import { GpuSurface, type GpuSurfaceHandle } from "../GpuSurface";
import type { GpuNodeLayout } from "../htmlSurfaces/frame";
import { GpuFlowLayoutStoreContext } from "../layoutStoreContext";
import {
  assertGpuFlowPortalGroupsRenderable,
  GpuFlowPortalLayer,
  partitionGpuFlowPortals,
} from "../portals/portalManager";
import {
  GpuFlowSceneContext,
  type GpuFlowSceneContextValue,
} from "../sceneContext";
import { getVisibleFlowRect, rectsIntersect } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  GpuFlowDomControlPlane,
  type GpuFlowRetainedScrollOffsetGetter,
} from "./domControlPlane";
import { GpuFlowDomIslandLayer } from "./domIslandLayer";
import { profileGpuFlowReactElement } from "./flowReactProfiler";
import type { GpuFlowProps } from "./flowSurfaceTypes";
import { renderGpuFlowNodeLayerElement } from "./nodeLayerElement";
import type { GpuFlowColdStartShellFrame } from "./visibleFrameTypes";

const GPU_FLOW_NODE_SOURCE_PROGRESSIVE_BATCH_SIZE = 4;
const GPU_FLOW_NODE_SOURCE_PROGRESSIVE_BATCH_DELAY_MS = 120;
const GPU_FLOW_NODE_SOURCE_MAX_INITIAL_PRIORITY_COUNT = 8;
const GPU_FLOW_NODE_SOURCE_PRIORITY_MARGIN_CSS_PX = 360;

export function GpuFlowSurfaceView({
  children,
  className,
  coldStartShellFrame,
  committedSurfaceRuntime,
  containerRef,
  deviceOptions,
  edgeLabelSourceElement,
  getRetainedDomControlScrollOffset,
  handleFrame,
  handlePaint,
  handleReady,
  handleResize,
  layoutStore,
  nodeClassName,
  nodeDragPreviewSourceElement,
  nodeResizeOverlaySourceElement,
  retainedDomControlSnapshotSourceElement,
  nodes,
  onNodeElementChange,
  onDomControlActivation,
  portals,
  renderDomIsland,
  renderNode,
  renderRetainedDomControl,
  sceneContextValue,
  selectionDrag,
  selectionOverlaySourceElement,
  style,
  surfaceClassName,
  surfaceRef,
  viewportRuntime,
  viewportStore,
}: {
  readonly children: ReactNode;
  readonly className: string;
  readonly coldStartShellFrame: GpuFlowColdStartShellFrame | null;
  readonly committedSurfaceRuntime: GpuFlowCommittedSurfaceRuntime;
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly deviceOptions: GpuFlowProps["deviceOptions"];
  readonly edgeLabelSourceElement: ReactNode;
  readonly getRetainedDomControlScrollOffset: GpuFlowRetainedScrollOffsetGetter;
  readonly handleFrame: NonNullable<GpuFlowProps["onFrame"]>;
  readonly handlePaint: NonNullable<GpuFlowProps["onPaint"]>;
  readonly handleReady: NonNullable<GpuFlowProps["onReady"]>;
  readonly handleResize: NonNullable<GpuFlowProps["onResize"]>;
  readonly layoutStore: GpuFlowProps["layoutStore"];
  readonly nodeClassName: GpuFlowProps["nodeClassName"];
  readonly nodeDragPreviewSourceElement: ReactNode;
  readonly nodeResizeOverlaySourceElement: ReactNode;
  readonly retainedDomControlSnapshotSourceElement: ReactNode;
  readonly nodes: readonly GpuNodeLayout[];
  readonly onNodeElementChange: NonNullable<
    GpuFlowProps["onNodeElementChange"]
  >;
  readonly onDomControlActivation: GpuFlowProps["onDomControlActivation"];
  readonly portals: GpuFlowProps["portals"];
  readonly renderDomIsland: GpuFlowProps["renderDomIsland"];
  readonly renderNode: GpuFlowProps["renderNode"];
  readonly renderRetainedDomControl: GpuFlowProps["renderRetainedDomControl"];
  readonly sceneContextValue: GpuFlowSceneContextValue;
  readonly selectionDrag: GpuFlowProps["selectionDrag"];
  readonly selectionOverlaySourceElement: ReactNode;
  readonly style: GpuFlowProps["style"];
  readonly surfaceClassName: string | undefined;
  readonly surfaceRef: RefObject<GpuSurfaceHandle | null>;
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly viewportStore: GpuFlowViewportStoreApi;
}) {
  const viewportPrioritySnapshot =
    useGpuFlowViewportPrioritySnapshot(viewportStore);
  const priorityNodeIds = useMemo(
    () =>
      resolveGpuFlowPrioritySourceNodeIds({
        nodes,
        viewportStore,
      }),
    [nodes, viewportPrioritySnapshot, viewportStore],
  );
  const nodeLayerElement = renderGpuFlowNodeLayerElement({
    nodeClassName,
    nodes,
    onNodeElementChange,
    priorityNodeIds,
    progressiveBatchDelayMs: GPU_FLOW_NODE_SOURCE_PROGRESSIVE_BATCH_DELAY_MS,
    progressiveBatchSize: GPU_FLOW_NODE_SOURCE_PROGRESSIVE_BATCH_SIZE,
    renderNode,
  });
  const portalGroups = partitionGpuFlowPortals(portals);
  assertGpuFlowPortalGroupsRenderable(portalGroups);
  return (
    <GpuFlowLayoutStoreContext.Provider value={layoutStore ?? null}>
      <GpuFlowSceneContext.Provider value={sceneContextValue}>
        <div
          className={className}
          data-tab-scope="canvas"
          ref={containerRef}
          style={style}
          tabIndex={selectionDrag ? -1 : undefined}
        >
          <GpuSurface
            className={surfaceClassName}
            deviceOptions={deviceOptions}
            onFrame={handleFrame}
            onPaint={handlePaint}
            onReady={handleReady}
            onResize={handleResize}
            ref={surfaceRef}
          >
            {profileGpuFlowReactElement("node-layer-source", nodeLayerElement)}
            {children}
            <GpuFlowPortalLayer portals={portalGroups.sourceLocal} />
            {edgeLabelSourceElement}
            {profileGpuFlowReactElement(
              "retained-dom-control-snapshot-source",
              retainedDomControlSnapshotSourceElement,
            )}
            {selectionOverlaySourceElement}
            {nodeResizeOverlaySourceElement}
            {nodeDragPreviewSourceElement}
          </GpuSurface>
          {profileGpuFlowReactElement(
            "dom-control-plane",
            <GpuFlowDomControlPlane
              committedSurfaceRuntime={committedSurfaceRuntime}
              getRetainedScrollOffset={getRetainedDomControlScrollOffset}
              onActivate={onDomControlActivation}
              renderControl={renderRetainedDomControl}
              surfaceRef={surfaceRef}
              viewportStore={viewportStore}
              viewportRuntime={viewportRuntime}
            />,
          )}
          {profileGpuFlowReactElement(
            "dom-island-layer",
            <GpuFlowDomIslandLayer
              committedSurfaceRuntime={committedSurfaceRuntime}
              renderDomIsland={renderDomIsland}
              viewportStore={viewportStore}
              viewportRuntime={viewportRuntime}
            />,
          )}
          {coldStartShellFrame ? (
            <GpuFlowColdStartShellOverlay frame={coldStartShellFrame} />
          ) : null}
          <GpuFlowPortalLayer portals={portalGroups.viewport} />
        </div>
      </GpuFlowSceneContext.Provider>
    </GpuFlowLayoutStoreContext.Provider>
  );
}

function GpuFlowColdStartShellOverlay({
  frame,
}: {
  readonly frame: GpuFlowColdStartShellFrame;
}) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="setta-gpu-flow__cold-start-shell"
      data-gpu-flow-cold-start-shell="true"
      data-gpu-flow-cold-start-shell-frame-id={frame.id}
      data-gpu-flow-cold-start-shell-input={frame.input}
      data-gpu-flow-cold-start-shell-reason={frame.reason}
      role="status"
    >
      <span className="setta-gpu-flow__cold-start-shell-label">
        Preparing surface
      </span>
    </div>
  );
}

function resolveGpuFlowPrioritySourceNodeIds({
  nodes,
  viewportStore,
}: {
  readonly nodes: readonly GpuNodeLayout[];
  readonly viewportStore: GpuFlowViewportStoreApi;
}): readonly string[] {
  if (nodes.length === 0) {
    return [];
  }
  const viewportState = viewportStore.getState();
  if (viewportState.width <= 0 || viewportState.height <= 0) {
    return nodes
      .slice(0, GPU_FLOW_NODE_SOURCE_PROGRESSIVE_BATCH_SIZE)
      .map((node) => node.nodeId);
  }
  const visibleRect = getVisibleFlowRect({
    canvasHeight: viewportState.height,
    canvasWidth: viewportState.width,
    marginCssPx: GPU_FLOW_NODE_SOURCE_PRIORITY_MARGIN_CSS_PX,
    viewport: viewportState.getViewport(),
  });
  const visibleCenterX = visibleRect.x + visibleRect.width / 2;
  const visibleCenterY = visibleRect.y + visibleRect.height / 2;
  const priorityCandidates: Array<{
    readonly distanceSquared: number;
    readonly nodeId: string;
    readonly order: number;
  }> = [];
  nodes.forEach((node, order) => {
    if (node.width === null || node.height === null) {
      return;
    }
    if (
      rectsIntersect(visibleRect, {
        height: node.height,
        width: node.width,
        x: node.x,
        y: node.y,
      })
    ) {
      const nodeCenterX = node.x + node.width / 2;
      const nodeCenterY = node.y + node.height / 2;
      priorityCandidates.push({
        distanceSquared:
          (nodeCenterX - visibleCenterX) ** 2 +
          (nodeCenterY - visibleCenterY) ** 2,
        nodeId: node.nodeId,
        order,
      });
    }
  });
  return priorityCandidates.length > 0
    ? priorityCandidates
        .sort(
          (left, right) =>
            left.distanceSquared - right.distanceSquared ||
            left.order - right.order,
        )
        .slice(0, GPU_FLOW_NODE_SOURCE_MAX_INITIAL_PRIORITY_COUNT)
        .map((candidate) => candidate.nodeId)
    : nodes
        .slice(0, GPU_FLOW_NODE_SOURCE_PROGRESSIVE_BATCH_SIZE)
        .map((node) => node.nodeId);
}

function useGpuFlowViewportPrioritySnapshot(
  viewportStore: GpuFlowViewportStoreApi,
): string {
  return useSyncExternalStore(
    (onStoreChange) => viewportStore.subscribe(onStoreChange),
    () => createGpuFlowViewportPrioritySnapshot(viewportStore),
    () => createGpuFlowViewportPrioritySnapshot(viewportStore),
  );
}

function createGpuFlowViewportPrioritySnapshot(
  viewportStore: GpuFlowViewportStoreApi,
): string {
  const { height, transform, width } = viewportStore.getState();
  return `${width}:${height}:${transform[0]}:${transform[1]}:${transform[2]}`;
}
