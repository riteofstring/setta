import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import type { GpuContentSurface, GpuDomIsland, GpuFlowScene } from "../scene";
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
  getScene,
  renderDomIsland,
  scene,
  viewportStore,
  viewportRuntime,
}: {
  readonly getScene?: (() => GpuFlowScene | undefined) | undefined;
  readonly renderDomIsland: GpuFlowDomIslandRenderer | undefined;
  readonly scene: GpuFlowScene | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportRuntime: GpuFlowViewportRuntime;
}) {
  const elementByIdRef = useRef(new Map<string, HTMLElement>());
  const domIslands = scene?.domIslands ?? [];
  const domIslandsRef = useRef(domIslands);
  domIslandsRef.current = domIslands;
  const getLiveDomIslands = useCallback(
    () => getScene?.()?.domIslands ?? domIslandsRef.current,
    [getScene],
  );
  const getLiveScene = useCallback(() => getScene?.(), [getScene]);
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
    [domIslandById, viewportRuntime, viewportStore],
  );

  useLayoutEffect(() => {
    return viewportRuntime.registerOverlayManager({
      applyViewport(viewport) {
        syncGpuFlowDomIslandLayerStyles({
          elementById: elementByIdRef.current,
          islands: getLiveDomIslands(),
          scene: getLiveScene(),
          viewport,
        });
      },
    });
  }, [getLiveDomIslands, getLiveScene, viewportRuntime]);

  useLayoutEffect(() => {
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform === previousState.transform) {
        return;
      }
      syncGpuFlowDomIslandLayerStyles({
        elementById: elementByIdRef.current,
        islands: getLiveDomIslands(),
        scene: getLiveScene(),
        viewport: state.transform,
      });
    });
  }, [viewportStore]);

  useLayoutEffect(() => {
    if (domIslands.length === 0) {
      return;
    }
    let animationFrameId: number | null = null;
    let disposed = false;
    const sync = () => {
      syncGpuFlowDomIslandLayerStyles({
        elementById: elementByIdRef.current,
        islands: getLiveDomIslands(),
        scene: getLiveScene(),
        viewport: getLiveGpuFlowDomIslandViewport({
          viewportRuntime,
        }),
      });
      if (!disposed) {
        animationFrameId = requestAnimationFrame(sync);
      }
    };
    sync();
    return () => {
      disposed = true;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [domIslands.length, viewportRuntime, viewportStore]);

  useLayoutEffect(() => {
    syncGpuFlowDomIslandLayerStyles({
      elementById: elementByIdRef.current,
      islands: getLiveDomIslands(),
      scene: getLiveScene(),
      viewport: getLiveGpuFlowDomIslandViewport({
        viewportRuntime,
      }),
    });
  }, [
    domIslands,
    getLiveDomIslands,
    getLiveScene,
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
          style={getGpuFlowDomIslandStyle(island, normalizedViewport)}
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

function syncGpuFlowDomIslandLayerStyles({
  elementById,
  islands,
  scene,
  viewport,
}: {
  readonly elementById: ReadonlyMap<string, HTMLElement>;
  readonly islands: readonly GpuDomIsland[];
  readonly scene?: GpuFlowScene | undefined;
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
    const liveIsland = resolveGpuFlowLiveDomIsland({
      island,
      scene,
    });
    if (!liveIsland || !rectsIntersect(visibleFlowRect, liveIsland.rect)) {
      hideGpuFlowDomIslandElement(element);
      element.style.pointerEvents = "none";
      continue;
    }
    syncGpuFlowDomIslandElementStyle({
      element,
      island: liveIsland,
      viewport,
    });
  }
}

function resolveGpuFlowLiveDomIsland({
  island,
  scene,
}: {
  readonly island: GpuDomIsland;
  readonly scene?: GpuFlowScene | undefined;
}): GpuDomIsland | null {
  if (island.source.kind !== "retained-content" || !scene) {
    return island;
  }
  const source = island.source;
  const surface = getGpuFlowRetainedContentSurfaceWithScene({
    scene,
    surfaceId: source.surfaceId,
  });
  if (!surface) {
    return null;
  }
  const hit = surface.retainedScene.hitRecords.find(
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
  const movedIslandRect = {
    ...island.rect,
    x: island.rect.x + nextControlRect.x - previousControlRect.x,
    y: island.rect.y + nextControlRect.y - previousControlRect.y,
  };
  const rect = intersectGpuFlowDomIslandRects(
    movedIslandRect,
    surface.clipRect,
  );
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

function getGpuFlowRetainedContentSurfaceWithScene({
  scene,
  surfaceId,
}: {
  readonly scene: GpuFlowScene;
  readonly surfaceId: string;
}):
  | (GpuContentSurface & {
      readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
    })
  | null {
  const surface = scene.contentSurfaces.find(
    (candidate) => candidate.id === surfaceId,
  );
  if (!surface?.retainedScene) {
    return null;
  }
  return surface as GpuContentSurface & {
    readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
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

function intersectGpuFlowDomIslandRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(maxY - y, 0),
    width: Math.max(maxX - x, 0),
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
