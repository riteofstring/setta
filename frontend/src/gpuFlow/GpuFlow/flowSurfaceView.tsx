import { useMemo, type ReactNode, type RefObject } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
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
import type { GpuFlowProps } from "./flowSurfaceTypes";
import { renderGpuFlowNodeLayerElement } from "./nodeLayerElement";

const GPU_FLOW_NODE_SOURCE_PROGRESSIVE_BATCH_SIZE = 1;
const GPU_FLOW_NODE_SOURCE_PRIORITY_MARGIN_CSS_PX = 360;

export function GpuFlowSurfaceView({
  children,
  className,
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
  visibleCommittedSurfaceFrame,
}: {
  readonly children: ReactNode;
  readonly className: string;
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
  readonly visibleCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame;
}) {
  const priorityNodeIds = useMemo(
    () =>
      resolveGpuFlowPrioritySourceNodeIds({
        nodes,
        viewportStore,
      }),
    [nodes, viewportStore],
  );
  const nodeLayerElement = renderGpuFlowNodeLayerElement({
    nodeClassName,
    nodes,
    onNodeElementChange,
    priorityNodeIds,
    progressiveBatchSize: GPU_FLOW_NODE_SOURCE_PROGRESSIVE_BATCH_SIZE,
    renderNode,
  });
  const portalGroups = partitionGpuFlowPortals(portals);
  assertGpuFlowPortalGroupsRenderable(portalGroups);
  const visibleRetainedRuntimeFrame =
    visibleCommittedSurfaceFrame.retainedRuntimeFrame;
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
            {nodeLayerElement}
            {children}
            <GpuFlowPortalLayer portals={portalGroups.sourceLocal} />
            {edgeLabelSourceElement}
            {retainedDomControlSnapshotSourceElement}
            {selectionOverlaySourceElement}
            {nodeResizeOverlaySourceElement}
            {nodeDragPreviewSourceElement}
          </GpuSurface>
          <GpuFlowDomControlPlane
            committedFrameId={visibleCommittedSurfaceFrame.displayFrameId}
            committedSurfaceRuntime={committedSurfaceRuntime}
            getRetainedScrollOffset={getRetainedDomControlScrollOffset}
            onActivate={onDomControlActivation}
            renderControl={renderRetainedDomControl}
            retainedRuntimeFrame={visibleRetainedRuntimeFrame}
            surfaceRef={surfaceRef}
            viewportStore={viewportStore}
            viewportRuntime={viewportRuntime}
          />
          <GpuFlowDomIslandLayer
            committedFrameId={visibleCommittedSurfaceFrame.displayFrameId}
            committedSurfaceRuntime={committedSurfaceRuntime}
            renderDomIsland={renderDomIsland}
            retainedRuntimeFrame={visibleRetainedRuntimeFrame}
            viewportStore={viewportStore}
            viewportRuntime={viewportRuntime}
          />
          <GpuFlowPortalLayer portals={portalGroups.viewport} />
        </div>
      </GpuFlowSceneContext.Provider>
    </GpuFlowLayoutStoreContext.Provider>
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
  const priorityIds: string[] = [];
  for (const node of nodes) {
    if (node.width === null || node.height === null) {
      continue;
    }
    if (
      rectsIntersect(visibleRect, {
        height: node.height,
        width: node.width,
        x: node.x,
        y: node.y,
      })
    ) {
      priorityIds.push(node.nodeId);
    }
  }
  return priorityIds.length > 0
    ? priorityIds
    : nodes
        .slice(0, GPU_FLOW_NODE_SOURCE_PROGRESSIVE_BATCH_SIZE)
        .map((node) => node.nodeId);
}
