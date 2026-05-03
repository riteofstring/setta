import { useEffect, type MutableRefObject } from "react";

import { redrawGpuRetainedContentSourceElement } from "../GpuRetainedContentSurfaces";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import {
  attachGpuRetainedContentConnectionController,
  type GpuRetainedContentConnectionControllerOptions,
} from "../interactions/retainedContentConnection";
import {
  attachGpuRetainedContentInteractionController,
  type GpuRetainedContentInteractionControllerOptions,
} from "../interactions/retainedContentInteraction";
import {
  attachGpuRetainedContentKeyboardController,
  type GpuRetainedContentKeyboardControllerOptions,
} from "../interactions/retainedContentKeyboard";
import {
  attachGpuRetainedContentScrollController,
  type GpuRetainedContentScrollControllerOptions,
} from "../interactions/retainedContentScroll";
import {
  attachGpuScenePortConnectionController,
  type GpuScenePortConnectionControllerOptions,
} from "../interactions/scenePortConnection";
import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import { applyGpuRetainedContentScrollOffsetToScene } from "../retainedContentScroll";
import {
  isGpuRetainedContentScrollbarHit,
  isGpuRetainedContentScrollbarThumbHit,
  resolveGpuRetainedContentScrollbarThumbDrag,
  resolveGpuRetainedContentScrollbarTrackClick,
} from "../retainedContentScrollbar";
import type { GpuDomIsland, GpuFlowScene } from "../scene";
import type { GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  hideGpuFlowDomIslandElement,
  syncGpuFlowDomIslandElementStyle,
} from "./domIslandLayer";

export type GpuFlowRetainedContentConnectionOptions =
  | false
  | Omit<
      GpuRetainedContentConnectionControllerOptions,
      "element" | "getScene" | "layoutStore" | "store"
    >
  | undefined;

export type GpuFlowRetainedContentInteractionOptions =
  | false
  | Omit<
      GpuRetainedContentInteractionControllerOptions,
      "element" | "getScene" | "requestFrame" | "store"
    >
  | undefined;

export type GpuFlowRetainedContentScrollOptions =
  | false
  | Omit<
      GpuRetainedContentScrollControllerOptions,
      "element" | "getScene" | "requestFrame" | "store"
    >
  | undefined;

export type GpuFlowRetainedContentKeyboardOptions =
  | false
  | Omit<
      GpuRetainedContentKeyboardControllerOptions,
      "element" | "getScene" | "requestFrame"
    >
  | undefined;

export type GpuFlowScenePortConnectionOptions =
  | false
  | Omit<
      GpuScenePortConnectionControllerOptions,
      "element" | "getScene" | "layoutStore" | "store"
    >
  | undefined;

type GpuFlowRetainedContentControllerOptions = {
  readonly containerRef: MutableRefObject<HTMLDivElement | null>;
  readonly layoutStore: GpuFlowLayoutStoreApi | null | undefined;
  readonly nodeLayerRef: MutableRefObject<{
    readonly scene: GpuFlowScene | undefined;
  }>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly retainedContentConnection: GpuFlowRetainedContentConnectionOptions;
  readonly retainedContentInteraction: GpuFlowRetainedContentInteractionOptions;
  readonly retainedContentKeyboard: GpuFlowRetainedContentKeyboardOptions;
  readonly retainedContentScroll: GpuFlowRetainedContentScrollOptions;
  readonly scenePortConnection: GpuFlowScenePortConnectionOptions;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly viewportStore: GpuFlowViewportStoreApi;
};

export function useGpuFlowRetainedContentControllers({
  containerRef,
  layoutStore,
  nodeLayerRef,
  nodeElementByIdRef,
  retainedContentConnection,
  retainedContentInteraction,
  retainedContentKeyboard,
  retainedContentScroll,
  scenePortConnection,
  surfaceRef,
  textureManagerRef,
  viewportStore,
}: GpuFlowRetainedContentControllerOptions) {
  useEffect(() => {
    if (retainedContentConnection === false) {
      return;
    }
    const container = containerRef.current;
    if (!container || !retainedContentConnection) {
      return;
    }
    if (!layoutStore) {
      throw new Error(
        "GpuFlow retained content connection requires a layout store.",
      );
    }
    return attachGpuRetainedContentConnectionController({
      ...retainedContentConnection,
      element: container,
      getScene: () => nodeLayerRef.current.scene,
      layoutStore,
      store: viewportStore,
    });
  }, [
    containerRef,
    layoutStore,
    nodeLayerRef,
    retainedContentConnection,
    viewportStore,
  ]);

  useEffect(() => {
    if (retainedContentInteraction === false) {
      return;
    }
    const container = containerRef.current;
    if (!container || !retainedContentInteraction) {
      return;
    }
    const retainedContentScrollbarScroll =
      retainedContentScroll && retainedContentScroll !== false
        ? retainedContentScroll
        : null;
    const commitRetainedContentScrollbarScrollResult = (result: {
      readonly scrollOffsets: ReadonlyMap<
        string,
        { readonly x: number; readonly y: number }
      >;
      readonly surfaceId: string | null;
    }) => {
      if (!retainedContentScrollbarScroll || !result.surfaceId) {
        return;
      }
      retainedContentScrollbarScroll.onScrollOffsetsChange(
        result.scrollOffsets,
        {
          changed: true,
          scrollOffsets: result.scrollOffsets,
          surfaceId: result.surfaceId,
        },
      );
      applyGpuFlowRetainedContentScrollResult({
        containerRef,
        nodeElementByIdRef,
        nodeLayerRef,
        result,
        surfaceRef,
        textureManagerRef,
        viewportStore,
      });
    };
    return attachGpuRetainedContentInteractionController({
      ...retainedContentInteraction,
      element: container,
      getScene: () => nodeLayerRef.current.scene,
      onHitClick: (event) => {
        if (
          retainedContentScrollbarScroll &&
          isGpuRetainedContentScrollbarHit(event)
        ) {
          const scene = nodeLayerRef.current.scene;
          if (!scene) {
            return;
          }
          const result = resolveGpuRetainedContentScrollbarTrackClick({
            hit: event,
            scene,
            scrollOffsets: retainedContentScrollbarScroll.getScrollOffsets(),
          });
          if (result.changed) {
            commitRetainedContentScrollbarScrollResult(result);
          }
          return;
        }
        retainedContentInteraction.onHitClick?.(event);
      },
      onHitDragCancel: (event) => {
        if (isGpuRetainedContentScrollbarHit(event.activeHit)) {
          return;
        }
        retainedContentInteraction.onHitDragCancel?.(event);
      },
      onHitDragEnd: (event) => {
        if (isGpuRetainedContentScrollbarHit(event.activeHit)) {
          return;
        }
        retainedContentInteraction.onHitDragEnd?.(event);
      },
      onHitDragFrame: (event) => {
        if (isGpuRetainedContentScrollbarHit(event.activeHit)) {
          return false;
        }
        return retainedContentInteraction.onHitDragFrame?.(event);
      },
      onHitDragMove: (event) => {
        if (
          retainedContentScrollbarScroll &&
          isGpuRetainedContentScrollbarThumbHit(event.activeHit)
        ) {
          const scene = nodeLayerRef.current.scene;
          if (!scene) {
            return false;
          }
          const result = resolveGpuRetainedContentScrollbarThumbDrag({
            activeHit: event.activeHit,
            flowPoint: event.flowPoint,
            scene,
            scrollOffsets: retainedContentScrollbarScroll.getScrollOffsets(),
          });
          if (result.changed) {
            commitRetainedContentScrollbarScrollResult(result);
          }
          return result.changed;
        }
        return retainedContentInteraction.onHitDragMove?.(event);
      },
      onHitDragStart: (event) => {
        if (isGpuRetainedContentScrollbarHit(event)) {
          return;
        }
        retainedContentInteraction.onHitDragStart?.(event);
      },
      onHitPointerDown: (event) => {
        if (isGpuRetainedContentScrollbarHit(event)) {
          return;
        }
        retainedContentInteraction.onHitPointerDown?.(event);
      },
      onHitPointerMove: (event) => {
        if (
          event.hit &&
          retainedContentScrollbarScroll &&
          isGpuRetainedContentScrollbarHit(event.hit)
        ) {
          return;
        }
        retainedContentInteraction.onHitPointerMove?.(event);
      },
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
      shouldHandleDragMoveHit: (event) =>
        (retainedContentScrollbarScroll &&
          isGpuRetainedContentScrollbarHit(event)) ||
        (retainedContentInteraction.shouldHandleDragMoveHit?.(event) ??
          retainedContentInteraction.shouldHandlePointerMoveHit?.(event) ??
          retainedContentInteraction.shouldHandleHit?.(event) ??
          true),
      shouldHandleHit: (event) =>
        (retainedContentScrollbarScroll &&
          isGpuRetainedContentScrollbarHit(event)) ||
        (retainedContentInteraction.shouldHandleHit?.(event) ?? true),
      shouldHandlePointerMoveHit: (event) =>
        (retainedContentScrollbarScroll &&
          isGpuRetainedContentScrollbarHit(event)) ||
        (retainedContentInteraction.shouldHandlePointerMoveHit?.(event) ??
          retainedContentInteraction.shouldHandleHit?.(event) ??
          true),
      shouldStartDrag: (event) =>
        (retainedContentScrollbarScroll &&
          isGpuRetainedContentScrollbarThumbHit(event)) ||
        (retainedContentInteraction.shouldStartDrag?.(event) ?? false),
      store: viewportStore,
    });
  }, [
    containerRef,
    nodeLayerRef,
    retainedContentInteraction,
    retainedContentScroll,
    nodeElementByIdRef,
    surfaceRef,
    textureManagerRef,
    viewportStore,
  ]);

  useEffect(() => {
    if (retainedContentKeyboard === false) {
      return;
    }
    const container = containerRef.current;
    if (!container || !retainedContentKeyboard) {
      return;
    }
    return attachGpuRetainedContentKeyboardController({
      ...retainedContentKeyboard,
      element: container,
      getScene: () => nodeLayerRef.current.scene,
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
    });
  }, [containerRef, nodeLayerRef, retainedContentKeyboard, surfaceRef]);

  useEffect(() => {
    if (retainedContentScroll === false) {
      return;
    }
    const container = containerRef.current;
    if (!container || !retainedContentScroll) {
      return;
    }
    return attachGpuRetainedContentScrollController({
      ...retainedContentScroll,
      element: container,
      getScene: () => nodeLayerRef.current.scene,
      onScrollOffsetsChange: (scrollOffsets, result) => {
        retainedContentScroll.onScrollOffsetsChange(scrollOffsets, result);
        applyGpuFlowRetainedContentScrollResult({
          containerRef,
          nodeElementByIdRef,
          nodeLayerRef,
          result,
          surfaceRef,
          textureManagerRef,
          viewportStore,
        });
      },
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
      store: viewportStore,
    });
  }, [
    containerRef,
    nodeLayerRef,
    nodeElementByIdRef,
    retainedContentScroll,
    surfaceRef,
    textureManagerRef,
    viewportStore,
  ]);

  useEffect(() => {
    if (scenePortConnection === false) {
      return;
    }
    const container = containerRef.current;
    if (!container || !scenePortConnection) {
      return;
    }
    if (!layoutStore) {
      throw new Error("GpuFlow scene port connection requires a layout store.");
    }
    return attachGpuScenePortConnectionController({
      ...scenePortConnection,
      element: container,
      getScene: () => nodeLayerRef.current.scene,
      layoutStore,
      store: viewportStore,
    });
  }, [
    containerRef,
    layoutStore,
    nodeLayerRef,
    scenePortConnection,
    viewportStore,
  ]);
}

function applyGpuFlowRetainedContentScrollResult({
  containerRef,
  nodeElementByIdRef,
  nodeLayerRef,
  result,
  surfaceRef,
  textureManagerRef,
  viewportStore,
}: {
  readonly containerRef: MutableRefObject<HTMLDivElement | null>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeLayerRef: MutableRefObject<{
    readonly scene: GpuFlowScene | undefined;
  }>;
  readonly result: {
    readonly scrollOffsets: ReadonlyMap<
      string,
      { readonly x: number; readonly y: number }
    >;
    readonly surfaceId: string | null;
  };
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly viewportStore: GpuFlowViewportStoreApi;
}) {
  const surfaceId = result.surfaceId;
  const scene = nodeLayerRef.current.scene;
  if (!surfaceId || !scene) {
    return;
  }
  const scrollOffset = result.scrollOffsets.get(surfaceId);
  if (!scrollOffset) {
    return;
  }
  const update = applyGpuRetainedContentScrollOffsetToScene({
    scene,
    scrollOffset,
    surfaceId,
  });
  if (!update) {
    return;
  }
  syncGpuFlowRetainedContentDomIslandElements({
    container: containerRef.current,
    nextScene: update.scene,
    previousScene: scene,
    surfaceId,
    viewport: viewportStore.getState().transform,
  });
  nodeLayerRef.current = {
    ...nodeLayerRef.current,
    scene: update.scene,
  };
  const sourceElement = nodeElementByIdRef.current.get(surfaceId);
  if (
    sourceElement &&
    redrawGpuRetainedContentSourceElement({
      element: sourceElement,
      surface: update.surface,
    })
  ) {
    textureManagerRef.current?.markSurfaceTextureDirty({
      content: true,
      reason: "content",
      requestPaint: false,
      surfaceId,
    });
    surfaceRef.current?.requestPaint();
  }
}

function syncGpuFlowRetainedContentDomIslandElements({
  container,
  nextScene,
  previousScene,
  surfaceId,
  viewport,
}: {
  readonly container: HTMLElement | null;
  readonly nextScene: GpuFlowScene;
  readonly previousScene: GpuFlowScene;
  readonly surfaceId: string;
  readonly viewport: GpuViewportInput;
}) {
  if (!container) {
    return;
  }
  const previousIslands = previousScene.domIslands.filter((island) =>
    isGpuFlowRetainedContentDomIslandForSurface(island, surfaceId),
  );
  if (previousIslands.length === 0) {
    return;
  }
  const nextIslandById = new Map(
    nextScene.domIslands.map((island) => [island.id, island]),
  );
  const islandElements = [
    ...container.querySelectorAll<HTMLElement>("[data-gpu-flow-dom-island-id]"),
  ];
  for (const previousIsland of previousIslands) {
    const element = islandElements.find(
      (candidate) =>
        candidate.getAttribute("data-gpu-flow-dom-island-id") ===
        previousIsland.id,
    );
    if (!element) {
      continue;
    }
    const nextIsland = nextIslandById.get(previousIsland.id);
    if (!nextIsland) {
      hideGpuFlowDomIslandElement(element);
      continue;
    }
    syncGpuFlowDomIslandElementStyle({
      element,
      island: nextIsland,
      viewport,
    });
  }
}

function isGpuFlowRetainedContentDomIslandForSurface(
  island: GpuDomIsland,
  surfaceId: string,
): boolean {
  return (
    island.source.kind === "retained-content" &&
    island.source.surfaceId === surfaceId
  );
}
