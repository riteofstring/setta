import type { ReactNode, RefObject } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
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
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  GpuFlowDomControlPlane,
  type GpuFlowRetainedScrollOffsetGetter,
} from "./domControlPlane";
import { GpuFlowDomIslandLayer } from "./domIslandLayer";
import type { GpuFlowProps } from "./flowSurfaceTypes";
import { renderGpuFlowNodeLayerElement } from "./nodeLayerElement";

export function GpuFlowSurfaceView({
  children,
  className,
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
  readonly nodes: readonly GpuNodeLayout[];
  readonly onNodeElementChange: GpuFlowProps["onNodeElementChange"];
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
  const nodeLayerElement = renderGpuFlowNodeLayerElement({
    nodeClassName,
    nodes,
    onNodeElementChange,
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
            {selectionOverlaySourceElement}
            {nodeResizeOverlaySourceElement}
            {nodeDragPreviewSourceElement}
          </GpuSurface>
          <GpuFlowDomControlPlane
            committedFrameId={visibleCommittedSurfaceFrame.displayFrameId}
            getRetainedScrollOffset={getRetainedDomControlScrollOffset}
            onActivate={onDomControlActivation}
            renderControl={renderRetainedDomControl}
            retainedRuntimeFrame={visibleRetainedRuntimeFrame}
            viewportStore={viewportStore}
            viewportRuntime={viewportRuntime}
          />
          <GpuFlowDomIslandLayer
            committedFrameId={visibleCommittedSurfaceFrame.displayFrameId}
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
