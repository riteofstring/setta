import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import {
  createGpuRetainedContentSampledSceneForSurface,
  isGpuRetainedContentSurfaceWithScene,
} from "../retainedContentRuntimeSampling";
import {
  getGpuRetainedContentRuntimeScrollOffsets,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import type { GpuDomIsland, GpuFlowScene } from "../scene";
import {
  flowToScreenPosition,
  getVisibleFlowRect,
  normalizeGpuViewport,
  type GpuRect,
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
  renderDomIsland,
  retainedContentRuntimeState,
  scene,
  viewportStore,
  viewportRuntime,
}: {
  readonly renderDomIsland: GpuFlowDomIslandRenderer | undefined;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly scene: GpuFlowScene | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportRuntime: GpuFlowViewportRuntime;
}) {
  const elementByIdRef = useRef(new Map<string, HTMLElement>());
  const domIslands = scene?.domIslands ?? [];
  const domIslandsRef = useRef(domIslands);
  const sceneRef = useRef(scene);
  domIslandsRef.current = domIslands;
  sceneRef.current = scene;
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
        const sampledIsland = sampleGpuFlowDomIsland({
          island,
          retainedContentRuntimeState,
          scene: sceneRef.current,
        });
        if (!sampledIsland) {
          hideGpuFlowDomIslandElement(element);
          element.style.pointerEvents = "none";
          return;
        }
        syncGpuFlowDomIslandElementStyle({
          element,
          island: sampledIsland,
          viewport: getLiveGpuFlowDomIslandViewport({
            viewportRuntime,
          }),
        });
      }
    },
    [domIslandById, retainedContentRuntimeState, viewportRuntime],
  );

  useLayoutEffect(() => {
    return viewportRuntime.registerOverlayManager({
      applyViewport(viewport) {
        syncGpuFlowDomIslandLayerStyles({
          elementById: elementByIdRef.current,
          islands: domIslandsRef.current,
          retainedContentRuntimeState,
          scene: sceneRef.current,
          viewport,
        });
      },
    });
  }, [retainedContentRuntimeState, viewportRuntime]);

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      syncGpuFlowDomIslandLayerStyles({
        elementById: elementByIdRef.current,
        islands: domIslandsRef.current,
        retainedContentRuntimeState,
        scene: sceneRef.current,
        viewport: state.transform,
      });
    });
  }, [retainedContentRuntimeState, viewportStore]);

  useLayoutEffect(() => {
    syncGpuFlowDomIslandLayerStyles({
      elementById: elementByIdRef.current,
      islands: domIslands,
      retainedContentRuntimeState,
      scene,
      viewport: getLiveGpuFlowDomIslandViewport({
        viewportRuntime,
      }),
    });
  }, [
    domIslands,
    retainedContentRuntimeState,
    scene,
    viewportRuntime,
    viewportStore,
  ]);

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
            retainedContentRuntimeState,
            scene,
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

export function syncGpuFlowDomIslandElementStyle({
  element,
  island,
  viewport,
}: {
  readonly element: HTMLElement;
  readonly island: GpuDomIsland;
  readonly viewport: GpuViewportInput;
}) {
  const style = getGpuFlowDomIslandStyle(
    island,
    normalizeGpuViewport(viewport),
  );
  element.style.display = "";
  element.style.height = `${style.height}px`;
  element.style.left = `${style.left}px`;
  element.style.pointerEvents = "auto";
  element.style.top = `${style.top}px`;
  element.style.transform = String(style.transform ?? "");
  element.style.transformOrigin = String(style.transformOrigin ?? "");
  element.style.width = `${style.width}px`;
  element.style.zIndex = String(style.zIndex ?? "");
}

export function hideGpuFlowDomIslandElement(element: HTMLElement) {
  element.style.display = "none";
}

function getGpuFlowDomIslandStyle(
  island: GpuDomIsland,
  viewport: ReturnType<typeof normalizeGpuViewport>,
): CSSProperties {
  const position = flowToScreenPosition(island.rect, viewport);
  return {
    height: island.rect.height,
    left: position.x,
    top: position.y,
    transform: `scale(${viewport.zoom})`,
    transformOrigin: "top left",
    width: island.rect.width,
    zIndex: island.zIndex,
  };
}

function getGpuFlowDomIslandInitialStyle({
  island,
  retainedContentRuntimeState,
  scene,
  viewport,
}: {
  readonly island: GpuDomIsland;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly scene: GpuFlowScene | undefined;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}): CSSProperties {
  const sampledIsland = sampleGpuFlowDomIsland({
    island,
    retainedContentRuntimeState,
    scene,
  });
  if (!sampledIsland) {
    return {
      display: "none",
      pointerEvents: "none",
    };
  }
  return getGpuFlowDomIslandStyle(sampledIsland, viewport);
}

function syncGpuFlowDomIslandLayerStyles({
  elementById,
  islands,
  retainedContentRuntimeState,
  scene,
  viewport,
}: {
  readonly elementById: ReadonlyMap<string, HTMLElement>;
  readonly islands: readonly GpuDomIsland[];
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly scene: GpuFlowScene | undefined;
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
    const sampledIsland = sampleGpuFlowDomIsland({
      island,
      retainedContentRuntimeState,
      scene,
    });
    if (
      !sampledIsland ||
      !rectsIntersect(visibleFlowRect, sampledIsland.rect)
    ) {
      hideGpuFlowDomIslandElement(element);
      element.style.pointerEvents = "none";
      continue;
    }
    syncGpuFlowDomIslandElementStyle({
      element,
      island: sampledIsland,
      viewport,
    });
  }
}

function sampleGpuFlowDomIsland({
  island,
  retainedContentRuntimeState,
  scene,
}: {
  readonly island: GpuDomIsland;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly scene: GpuFlowScene | undefined;
}): GpuDomIsland | null {
  const source = island.source;
  if (!scene || source.kind !== "retained-content") {
    return island;
  }
  const surface = scene.contentSurfaces.find(
    (candidate) => candidate.id === source.surfaceId,
  );
  if (!surface || !isGpuRetainedContentSurfaceWithScene(surface)) {
    return null;
  }
  const retainedScene = createGpuRetainedContentSampledSceneForSurface({
    scrollOffsets: getGpuRetainedContentRuntimeScrollOffsets(
      retainedContentRuntimeState,
    ),
    surface,
  });
  const hit = retainedScene.hitRecords.find(
    (candidate) =>
      candidate.id === source.hitRecordId &&
      candidate.ownerRowId === source.ownerRowId,
  );
  if (!hit) {
    return null;
  }
  const previousControlRect = getGpuFlowDomIslandControlRect(island);
  const nextControlRect = translateGpuFlowDomIslandLocalRect(
    hit.rect,
    surface.rect,
  );
  const delta = {
    x: nextControlRect.x - previousControlRect.x,
    y: nextControlRect.y - previousControlRect.y,
  };
  const movedIslandRect = {
    ...island.rect,
    x: island.rect.x + delta.x,
    y: island.rect.y + delta.y,
  };
  const rect = intersectGpuFlowRects(movedIslandRect, surface.clipRect);
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    ...island,
    contentRect: {
      ...island.contentRect,
      x: nextControlRect.x - rect.x,
      y: nextControlRect.y - rect.y,
    },
    rect,
  };
}

function getGpuFlowDomIslandControlRect(island: GpuDomIsland): GpuRect {
  return {
    height: island.contentRect.height,
    width: island.contentRect.width,
    x: island.rect.x + island.contentRect.x,
    y: island.rect.y + island.contentRect.y,
  };
}

function translateGpuFlowDomIslandLocalRect(
  localRect: GpuRect,
  parentRect: GpuRect,
): GpuRect {
  return {
    height: Math.min(localRect.height, parentRect.height),
    width: Math.min(localRect.width, parentRect.width),
    x: parentRect.x + localRect.x,
    y: parentRect.y + localRect.y,
  };
}

function intersectGpuFlowRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - x,
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - y,
  );
  return {
    height,
    width,
    x,
    y,
  };
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
