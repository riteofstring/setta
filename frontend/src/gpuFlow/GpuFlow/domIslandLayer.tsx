import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import {
  applyHtmlSurfaceActiveDomIslandProjection,
  hideHtmlSurfaceActiveDomIslandProjection,
  projectHtmlSurfaceActiveDomIsland,
} from "../htmlSurfaces/interactionProjector";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuDomIsland } from "../scene";
import {
  getVisibleFlowRect,
  normalizeGpuViewport,
  type GpuViewportInput,
  type GpuViewportTuple,
} from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

export type GpuFlowDomIslandRenderer = (island: GpuDomIsland) => ReactNode;

const GPU_FLOW_DOM_ISLAND_CLASS_NAME = [
  "setta-gpu-flow__dom-island",
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
].join(" ");
const GPU_FLOW_DOM_ISLAND_LAYER_CLASS_NAME = "setta-gpu-flow__dom-island-layer";

export function GpuFlowDomIslandLayer({
  committedFrameId,
  renderDomIsland,
  retainedRuntimeFrame,
  viewportStore,
  viewportRuntime,
}: {
  readonly committedFrameId?: number | undefined;
  readonly renderDomIsland: GpuFlowDomIslandRenderer | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportRuntime: GpuFlowViewportRuntime;
}) {
  const elementByIdRef = useRef(new Map<string, HTMLElement>());
  const domIslands = useMemo(
    () => retainedRuntimeFrame?.descriptors.nativeDomIslands ?? [],
    [retainedRuntimeFrame],
  );
  const domIslandsRef = useRef(domIslands);
  domIslandsRef.current = domIslands;
  const domIslandById = useMemo(
    () => new Map(domIslands.map((island) => [island.id, island])),
    [domIslands],
  );

  const setDomIslandElement = useCallback(
    (islandId: string, element: HTMLElement | null) => {
      if (!element) {
        elementByIdRef.current.delete(islandId);
        return;
      }
      elementByIdRef.current.set(islandId, element);
      const island = domIslandById.get(islandId);
      if (island) {
        syncGpuFlowDomIslandElementStyle({
          element,
          island,
          viewport: getLiveGpuFlowDomIslandViewport({
            viewportRuntime,
          }),
        });
      }
    },
    [domIslandById, viewportRuntime],
  );

  useLayoutEffect(() => {
    return viewportRuntime.registerOverlayManager({
      applyViewport(viewport) {
        syncGpuFlowDomIslandLayerStyles({
          elementById: elementByIdRef.current,
          islands: domIslandsRef.current,
          viewport,
        });
      },
    });
  }, [viewportRuntime]);

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      syncGpuFlowDomIslandLayerStyles({
        elementById: elementByIdRef.current,
        islands: domIslandsRef.current,
        viewport: state.transform,
      });
    });
  }, [viewportStore]);

  useLayoutEffect(() => {
    syncGpuFlowDomIslandLayerStyles({
      elementById: elementByIdRef.current,
      islands: domIslands,
      viewport: getLiveGpuFlowDomIslandViewport({
        viewportRuntime,
      }),
    });
  }, [domIslands, viewportRuntime, viewportStore]);

  if (!renderDomIsland || domIslands.length === 0) {
    return null;
  }

  const normalizedViewport = normalizeGpuViewport(
    getLiveGpuFlowDomIslandViewport({
      viewportRuntime,
    }),
  );
  return (
    <div
      className={GPU_FLOW_DOM_ISLAND_LAYER_CLASS_NAME}
      data-gpu-flow-dom-island-committed-frame-id={
        committedFrameId ?? retainedRuntimeFrame?.frameId ?? 0
      }
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
          {renderDomIsland(island)}
        </div>
      ))}
    </div>
  );
}

function getLiveGpuFlowDomIslandViewport({
  viewportRuntime,
}: {
  readonly viewportRuntime: GpuFlowViewportRuntime;
}): GpuViewportTuple {
  return viewportRuntime.getViewportTuple();
}

function syncGpuFlowDomIslandElementStyle({
  element,
  island,
  viewport,
}: {
  readonly element: HTMLElement;
  readonly island: GpuDomIsland;
  readonly viewport: GpuViewportInput;
}) {
  applyHtmlSurfaceActiveDomIslandProjection({
    element,
    projection: projectHtmlSurfaceActiveDomIsland({
      flowRect: island.rect,
      viewport,
      zIndex: island.zIndex,
    }),
  });
}

function hideGpuFlowDomIslandElement(element: HTMLElement) {
  hideHtmlSurfaceActiveDomIslandProjection(element);
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

function syncGpuFlowDomIslandLayerStyles({
  elementById,
  islands,
  viewport,
}: {
  readonly elementById: ReadonlyMap<string, HTMLElement>;
  readonly islands: readonly GpuDomIsland[];
  readonly viewport: GpuViewportInput;
}) {
  const visibleFlowRect = getVisibleFlowRect({
    canvasHeight: window.innerHeight,
    canvasWidth: window.innerWidth,
    marginCssPx: 128,
    viewport,
  });
  for (const island of islands) {
    const element = elementById.get(island.id);
    if (!element) {
      continue;
    }
    if (!rectsIntersect(visibleFlowRect, island.rect)) {
      hideGpuFlowDomIslandElement(element);
      element.style.pointerEvents = "none";
      continue;
    }
    syncGpuFlowDomIslandElementStyle({
      element,
      island,
      viewport,
    });
  }
}

function rectsIntersect(
  left: GpuDomIsland["rect"],
  right: GpuDomIsland["rect"],
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}
