import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import { projectHtmlSurfaceActiveDomIsland } from "../htmlSurfaces/interactionProjector";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuDomIsland } from "../scene";
import { normalizeGpuViewport } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  createGpuFlowBrowserVisualActorRuntime,
  getGpuFlowBrowserVisualActorRuntimeForCommittedSurface,
  type GpuFlowBrowserVisualActorRuntime,
} from "./browserVisualActorRuntime";

export type GpuFlowDomIslandRenderer = (island: GpuDomIsland) => ReactNode;

const GPU_FLOW_DOM_ISLAND_CLASS_NAME = [
  "setta-gpu-flow__dom-island",
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
].join(" ");
const GPU_FLOW_DOM_ISLAND_LAYER_CLASS_NAME = "setta-gpu-flow__dom-island-layer";

export function GpuFlowDomIslandLayer({
  committedFrameId,
  committedSurfaceRuntime,
  renderDomIsland,
  retainedRuntimeFrame,
  viewportStore,
  viewportRuntime,
}: {
  readonly committedFrameId?: number | undefined;
  readonly committedSurfaceRuntime?: GpuFlowCommittedSurfaceRuntime | undefined;
  readonly renderDomIsland: GpuFlowDomIslandRenderer | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportRuntime: GpuFlowViewportRuntime;
}) {
  const fallbackRuntimeRef = useRef<GpuFlowBrowserVisualActorRuntime | null>(
    null,
  );
  const browserVisualRuntime = useMemo(() => {
    if (committedSurfaceRuntime) {
      return getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
        committedSurfaceRuntime,
      );
    }
    fallbackRuntimeRef.current ??= createGpuFlowBrowserVisualActorRuntime();
    return fallbackRuntimeRef.current;
  }, [committedSurfaceRuntime]);
  const snapshot = useSyncExternalStore(
    browserVisualRuntime.subscribe.bind(browserVisualRuntime),
    browserVisualRuntime.getSnapshot.bind(browserVisualRuntime),
    browserVisualRuntime.getSnapshot.bind(browserVisualRuntime),
  );
  const domIslands = snapshot.domIslands.islands;
  const frameIds = snapshot.frameIds;

  const setDomIslandElement = useCallback(
    (islandId: string, element: HTMLElement | null) => {
      browserVisualRuntime.setDomIslandElement({ element, islandId });
    },
    [browserVisualRuntime],
  );

  useLayoutEffect(() => {
    browserVisualRuntime.setCommittedSurfaceSource({
      committedFrameId,
      committedSurfaceRuntime,
      retainedRuntimeFrame,
    });
  }, [
    browserVisualRuntime,
    committedFrameId,
    committedSurfaceRuntime,
    retainedRuntimeFrame,
  ]);

  useLayoutEffect(() => {
    browserVisualRuntime.setDomIslandProjectionEnvironment({
      viewportRuntime,
      viewportStore,
    });
  }, [browserVisualRuntime, viewportRuntime, viewportStore]);

  useLayoutEffect(() => {
    return viewportRuntime.registerOverlayManager({
      applyViewport(viewport) {
        browserVisualRuntime.projectDomIslands(viewport);
      },
    });
  }, [browserVisualRuntime, viewportRuntime]);

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      browserVisualRuntime.projectDomIslands(state.transform);
    });
  }, [browserVisualRuntime, viewportStore]);

  useLayoutEffect(() => {
    browserVisualRuntime.projectDomIslands();
  }, [browserVisualRuntime, domIslands]);

  const renderDomIslandContent = renderDomIsland;
  if (!renderDomIslandContent || domIslands.length === 0) {
    return null;
  }

  const normalizedViewport = normalizeGpuViewport(
    viewportRuntime.getViewportTuple(),
  );
  return (
    <div
      className={GPU_FLOW_DOM_ISLAND_LAYER_CLASS_NAME}
      data-gpu-flow-dom-island-committed-frame-id={frameIds.committedFrameId}
      data-gpu-flow-dom-island-layer="viewport"
    >
      {domIslands.map((island) => (
        <div
          className={GPU_FLOW_DOM_ISLAND_CLASS_NAME}
          data-gpu-flow-dom-island="true"
          data-gpu-flow-dom-island-id={island.id}
          data-gpu-flow-dom-island-kind={island.kind}
          key={island.id}
          ref={(element) => setDomIslandElement(island.id, element)}
          style={getGpuFlowDomIslandInitialStyle({
            island,
            viewport: normalizedViewport,
          })}
        >
          {renderDomIslandContent(island)}
        </div>
      ))}
    </div>
  );
}

function getGpuFlowDomIslandInitialStyle({
  island,
  viewport,
}: {
  readonly island: GpuDomIsland;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}) {
  return projectHtmlSurfaceActiveDomIsland({
    flowRect: island.rect,
    viewport,
    zIndex: island.zIndex,
  });
}
