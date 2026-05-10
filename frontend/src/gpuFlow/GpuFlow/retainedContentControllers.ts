import { useEffect, useRef, type MutableRefObject } from "react";

import { getGpuRetainedContentScrollbarVisuals } from "../GpuRetainedContentScrollbarVisuals";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type { MutableGpuFlowInteractionDiagnostics } from "../interactionDiagnostics";
import {
  attachGpuRetainedContentConnectionController,
  type GpuRetainedContentConnectionControllerOptions,
} from "../interactions/retainedContentConnection";
import {
  attachGpuRetainedContentInteractionController,
  type GpuRetainedContentInteractionControllerOptions,
  type GpuRetainedContentInteractionHit,
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
import {
  applyGpuRetainedContentRowHoverTargetToScene,
  areGpuRetainedContentRowHoverTargetsEqual,
  getGpuRetainedContentRowHoverVisuals,
  type GpuRetainedContentRowHoverTarget,
} from "../retainedContentRowHover";
import { applyGpuRetainedContentScrollOffsetToScene } from "../retainedContentScroll";
import {
  applyGpuRetainedContentScrollbarVisualStateToScene,
  getGpuRetainedContentScrollbarVisualTarget,
  isGpuRetainedContentScrollbarHit,
  isGpuRetainedContentScrollbarThumbHit,
  resolveGpuRetainedContentScrollbarThumbDrag,
  resolveGpuRetainedContentScrollbarTrackClick,
  type GpuRetainedContentScrollbarVisualState,
  type GpuRetainedContentScrollbarVisualTarget,
} from "../retainedContentScrollbar";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { GpuDomIsland, GpuFlowScene } from "../scene";
import type { GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  hideGpuFlowDomIslandElement,
  syncGpuFlowDomIslandElementStyle,
} from "./domIslandLayer";
import {
  mergeGpuFlowRetainedContentSurfaceLayouts,
  redrawGpuFlowRetainedContentSurfaceSources,
  type GpuFlowRetainedContentNodeLayerState,
  type GpuFlowRetainedContentPageManager,
  type GpuFlowRetainedContentTextureManager,
  type GpuRetainedContentSurfaceWithScene,
} from "./retainedContentControllerSurfaceUpdates";

function getRetainedContentNativeVisuals(scene: GpuFlowScene | undefined) {
  return getGpuRetainedContentScrollbarVisuals(scene?.contentSurfaces);
}

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
      | "element"
      | "getScene"
      | "interactionDiagnostics"
      | "requestFrame"
      | "store"
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
  readonly interactionDiagnosticsRef?:
    | MutableRefObject<MutableGpuFlowInteractionDiagnostics>
    | undefined;
  readonly nodeLayerRef: MutableRefObject<GpuFlowRetainedContentNodeLayerState>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly retainedContentConnection: GpuFlowRetainedContentConnectionOptions;
  readonly retainedContentInteraction: GpuFlowRetainedContentInteractionOptions;
  readonly retainedContentKeyboard: GpuFlowRetainedContentKeyboardOptions;
  readonly retainedContentPageManagerRef: MutableRefObject<GpuFlowRetainedContentPageManager | null>;
  readonly retainedContentScroll: GpuFlowRetainedContentScrollOptions;
  readonly retainedContentSwitchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly scenePortConnection: GpuFlowScenePortConnectionOptions;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
  readonly viewportStore: GpuFlowViewportStoreApi;
};

export function useGpuFlowRetainedContentControllers({
  containerRef,
  interactionDiagnosticsRef,
  layoutStore,
  nodeLayerRef,
  nodeElementByIdRef,
  retainedContentConnection,
  retainedContentInteraction,
  retainedContentKeyboard,
  retainedContentPageManagerRef,
  retainedContentScroll,
  retainedContentSwitchAnimations,
  scenePortConnection,
  surfaceRef,
  textureManagerRef,
  viewportStore,
}: GpuFlowRetainedContentControllerOptions) {
  const retainedContentInteractionRef = useRef(retainedContentInteraction);
  retainedContentInteractionRef.current = retainedContentInteraction;
  const retainedContentScrollRef = useRef(retainedContentScroll);
  retainedContentScrollRef.current = retainedContentScroll;
  const retainedContentRowHoverTargetRef =
    useRef<GpuRetainedContentRowHoverTarget | null>(null);
  const retainedContentInteractionEnabled =
    retainedContentInteraction !== false && Boolean(retainedContentInteraction);

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
    if (!retainedContentInteractionEnabled) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const getRetainedContentInteraction = () =>
      retainedContentInteractionRef.current === false
        ? null
        : retainedContentInteractionRef.current ?? null;
    const getRetainedContentScrollbarScroll = () =>
      retainedContentScrollRef.current === false
        ? null
        : retainedContentScrollRef.current ?? null;
    let retainedContentScrollbarVisualState: GpuRetainedContentScrollbarVisualState =
      {
        activeTarget: null,
        hoveredTarget: null,
      };
    const setRetainedContentScrollbarVisualState = (
      nextState: GpuRetainedContentScrollbarVisualState,
    ) => {
      if (
        areGpuFlowRetainedContentScrollbarVisualStatesEqual(
          retainedContentScrollbarVisualState,
          nextState,
        )
      ) {
        return;
      }
      retainedContentScrollbarVisualState = nextState;
      applyGpuFlowRetainedContentScrollbarVisualState({
        nodeLayerRef,
        getNativeVisuals: (scene) =>
          getGpuFlowRetainedContentNativeVisuals({
            rowHoverTarget: retainedContentRowHoverTargetRef.current,
            scene,
          }),
        surfaceRef,
        visualState: retainedContentScrollbarVisualState,
      });
    };
    const setRetainedContentScrollbarActiveTarget = (
      activeTarget: GpuRetainedContentScrollbarVisualTarget | null,
    ) => {
      setRetainedContentScrollbarVisualState({
        ...retainedContentScrollbarVisualState,
        activeTarget,
      });
    };
    const setRetainedContentScrollbarHoveredTarget = (
      hoveredTarget: GpuRetainedContentScrollbarVisualTarget | null,
    ) => {
      setRetainedContentScrollbarVisualState({
        ...retainedContentScrollbarVisualState,
        hoveredTarget,
      });
    };
    const setRetainedContentRowHoverTarget = (
      nextTarget: GpuRetainedContentRowHoverTarget | null,
    ) => {
      const scene = nodeLayerRef.current.scene;
      if (
        areGpuRetainedContentRowHoverTargetsEqual(
          retainedContentRowHoverTargetRef.current,
          nextTarget,
        )
      ) {
        return;
      }
      retainedContentRowHoverTargetRef.current = nextTarget;
      if (!scene) {
        return;
      }
      const update = applyGpuRetainedContentRowHoverTargetToScene({
        scene,
        target: nextTarget,
      });
      if (!update) {
        return;
      }
      nodeLayerRef.current = {
        ...nodeLayerRef.current,
        edgeLabelSurfaces: mergeGpuFlowRetainedContentSurfaceLayouts({
          overlays: nodeLayerRef.current.edgeLabelSurfaces,
          scene: update.scene,
        }),
        htmlSurfaceNativeVisuals: getGpuFlowRetainedContentNativeVisuals({
          rowHoverTarget: nextTarget,
          scene: update.scene,
        }),
        scene: update.scene,
      };
      surfaceRef.current?.requestFrame("manual");
    };
    const commitRetainedContentScrollbarScrollResult = (result: {
      readonly scrollOffsets: ReadonlyMap<
        string,
        { readonly x: number; readonly y: number }
      >;
      readonly surfaceId: string | null;
    }) => {
      const retainedContentScrollbarScroll =
        getRetainedContentScrollbarScroll();
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
        retainedContentPageManagerRef,
        result,
        scrollbarVisualState: retainedContentScrollbarVisualState,
        getNativeVisuals: getRetainedContentNativeVisuals,
        surfaceRef,
        switchAnimations: retainedContentSwitchAnimations,
        textureManagerRef,
        viewportStore,
      });
    };
    const detachRetainedContentInteractionController =
      attachGpuRetainedContentInteractionController({
        disabled: () =>
          isGpuFlowRetainedContentInteractionOptionsDisabled(
            getRetainedContentInteraction(),
          ),
        element: container,
        getScene: () => nodeLayerRef.current.scene,
        interactionDiagnostics: interactionDiagnosticsRef,
        onHitClick: (event) => {
          const retainedContentInteraction = getRetainedContentInteraction();
          const retainedContentScrollbarScroll =
            getRetainedContentScrollbarScroll();
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
            setRetainedContentScrollbarVisualState({
              activeTarget: null,
              hoveredTarget:
                getGpuRetainedContentScrollbarVisualTarget(event) ??
                retainedContentScrollbarVisualState.hoveredTarget,
            });
            return;
          }
          beginGpuFlowRetainedContentSwitchClickAnimation({
            event,
            switchAnimations: retainedContentSwitchAnimations,
          });
          retainedContentInteraction?.onHitClick?.(event);
        },
        onHitDragCancel: (event) => {
          const retainedContentInteraction = getRetainedContentInteraction();
          if (isGpuRetainedContentScrollbarHit(event.activeHit)) {
            setRetainedContentRowHoverTarget(null);
            setRetainedContentScrollbarActiveTarget(null);
            return;
          }
          retainedContentInteraction?.onHitDragCancel?.(event);
        },
        onHitDragEnd: (event) => {
          const retainedContentInteraction = getRetainedContentInteraction();
          if (isGpuRetainedContentScrollbarHit(event.activeHit)) {
            setRetainedContentScrollbarVisualState({
              activeTarget: null,
              hoveredTarget: getGpuRetainedContentScrollbarVisualTarget(
                event.hit,
              ),
            });
            return;
          }
          retainedContentInteraction?.onHitDragEnd?.(event);
        },
        onHitDragFrame: (event) => {
          const retainedContentInteraction = getRetainedContentInteraction();
          if (isGpuRetainedContentScrollbarHit(event.activeHit)) {
            return false;
          }
          return retainedContentInteraction?.onHitDragFrame?.(event);
        },
        onHitDragMove: (event) => {
          const retainedContentInteraction = getRetainedContentInteraction();
          const retainedContentScrollbarScroll =
            getRetainedContentScrollbarScroll();
          if (
            retainedContentScrollbarScroll &&
            isGpuRetainedContentScrollbarThumbHit(event.activeHit)
          ) {
            setRetainedContentScrollbarActiveTarget(
              getGpuRetainedContentScrollbarVisualTarget(event.activeHit),
            );
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
          return retainedContentInteraction?.onHitDragMove?.(event);
        },
        onHitDragStart: (event) => {
          const retainedContentInteraction = getRetainedContentInteraction();
          if (isGpuRetainedContentScrollbarHit(event)) {
            setRetainedContentRowHoverTarget(null);
            setRetainedContentScrollbarActiveTarget(
              getGpuRetainedContentScrollbarVisualTarget(event),
            );
            return;
          }
          retainedContentInteraction?.onHitDragStart?.(event);
        },
        onHitPointerDown: (event) => {
          const retainedContentInteraction = getRetainedContentInteraction();
          if (isGpuRetainedContentScrollbarHit(event)) {
            setRetainedContentRowHoverTarget(null);
            const target = getGpuRetainedContentScrollbarVisualTarget(event);
            setRetainedContentScrollbarVisualState({
              activeTarget: target,
              hoveredTarget:
                target ?? retainedContentScrollbarVisualState.hoveredTarget,
            });
            return;
          }
          retainedContentInteraction?.onHitPointerDown?.(event);
        },
        onHitPointerLeave: () => {
          const retainedContentInteraction = getRetainedContentInteraction();
          setRetainedContentRowHoverTarget(null);
          setRetainedContentScrollbarHoveredTarget(null);
          retainedContentInteraction?.onHitPointerLeave?.();
        },
        onHitPointerMove: (event) => {
          const retainedContentInteraction = getRetainedContentInteraction();
          const retainedContentScrollbarScroll =
            getRetainedContentScrollbarScroll();
          if (
            event.hit &&
            retainedContentScrollbarScroll &&
            isGpuRetainedContentScrollbarHit(event.hit)
          ) {
            setRetainedContentRowHoverTarget(null);
            setRetainedContentScrollbarHoveredTarget(
              getGpuRetainedContentScrollbarVisualTarget(event.hit),
            );
            return;
          }
          setRetainedContentScrollbarHoveredTarget(null);
          setRetainedContentRowHoverTarget(
            event.hit
              ? {
                  rowId: event.hit.hit.ownerRowId,
                  surfaceId: event.hit.surfaceId,
                }
              : null,
          );
          retainedContentInteraction?.onHitPointerMove?.(event);
        },
        requestFrame: (reason) => {
          surfaceRef.current?.requestFrame(reason);
        },
        shouldHandleDragMoveHit: (event) =>
          (getRetainedContentScrollbarScroll() &&
            isGpuRetainedContentScrollbarHit(event)) ||
          shouldHandleGpuFlowRetainedContentDragMoveHit(
            getRetainedContentInteraction(),
            event,
          ),
        shouldHandleHit: (event) =>
          (getRetainedContentScrollbarScroll() &&
            isGpuRetainedContentScrollbarHit(event)) ||
          shouldHandleGpuFlowRetainedContentHit(
            getRetainedContentInteraction(),
            event,
          ),
        shouldHandlePointerMoveHit: (event) =>
          (getRetainedContentScrollbarScroll() &&
            isGpuRetainedContentScrollbarHit(event)) ||
          shouldHandleGpuFlowRetainedContentPointerMoveHit(
            getRetainedContentInteraction(),
            event,
          ),
        shouldStartDrag: (event) =>
          (getRetainedContentScrollbarScroll() &&
            isGpuRetainedContentScrollbarThumbHit(event)) ||
          (getRetainedContentInteraction()?.shouldStartDrag?.(event) ?? false),
        store: viewportStore,
      });
    return () => {
      detachRetainedContentInteractionController();
    };
  }, [
    containerRef,
    interactionDiagnosticsRef,
    nodeLayerRef,
    retainedContentInteractionEnabled,
    retainedContentSwitchAnimations,
    retainedContentPageManagerRef,
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
          retainedContentPageManagerRef,
          result,
          surfaceRef,
          getNativeVisuals: (scene) =>
            getGpuFlowRetainedContentNativeVisuals({
              rowHoverTarget: retainedContentRowHoverTargetRef.current,
              scene,
            }),
          switchAnimations: retainedContentSwitchAnimations,
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
    retainedContentSwitchAnimations,
    retainedContentRowHoverTargetRef,
    retainedContentPageManagerRef,
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
  getNativeVisuals,
  nodeElementByIdRef,
  nodeLayerRef,
  retainedContentPageManagerRef,
  result,
  scrollbarVisualState,
  surfaceRef,
  switchAnimations,
  textureManagerRef,
  viewportStore,
}: {
  readonly containerRef: MutableRefObject<HTMLDivElement | null>;
  readonly getNativeVisuals: (
    scene: GpuFlowScene,
  ) => NonNullable<
    GpuFlowRetainedContentNodeLayerState["htmlSurfaceNativeVisuals"]
  >;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowRetainedContentNodeLayerState>;
  readonly retainedContentPageManagerRef: MutableRefObject<GpuFlowRetainedContentPageManager | null>;
  readonly result: {
    readonly scrollOffsets: ReadonlyMap<
      string,
      { readonly x: number; readonly y: number }
    >;
    readonly surfaceId: string | null;
  };
  readonly scrollbarVisualState?:
    | GpuRetainedContentScrollbarVisualState
    | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
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
  let nextScene = update.scene;
  const surfacesToRedraw = new Map<
    string,
    GpuRetainedContentSurfaceWithScene
  >();
  surfacesToRedraw.set(update.surface.id, update.surface);
  if (scrollbarVisualState) {
    const scrollbarVisualUpdate =
      applyGpuRetainedContentScrollbarVisualStateToScene({
        scene: nextScene,
        visualState: scrollbarVisualState,
      });
    if (scrollbarVisualUpdate) {
      nextScene = scrollbarVisualUpdate.scene;
    }
  }
  syncGpuFlowRetainedContentDomIslandElements({
    container: containerRef.current,
    nextScene,
    previousScene: scene,
    surfaceId,
    viewport: viewportStore.getState().transform,
  });
  nodeLayerRef.current = {
    ...nodeLayerRef.current,
    edgeLabelSurfaces: mergeGpuFlowRetainedContentSurfaceLayouts({
      overlays: nodeLayerRef.current.edgeLabelSurfaces,
      scene: nextScene,
    }),
    htmlSurfaceNativeVisuals: getNativeVisuals(nextScene),
    scene: nextScene,
  };
  redrawGpuFlowRetainedContentSurfaceSources({
    nodeElementByIdRef,
    retainedContentPageManagerRef,
    surfaceRef,
    surfaces: [...surfacesToRedraw.values()],
    switchAnimations,
    textureManagerRef,
  });
  surfaceRef.current?.requestFrame("manual");
}

function isGpuFlowRetainedContentInteractionOptionsDisabled(
  options: GpuFlowRetainedContentInteractionOptions | null,
): boolean {
  if (!options) {
    return true;
  }
  const disabled = options.disabled;
  return typeof disabled === "function" ? disabled() : Boolean(disabled);
}

function getGpuFlowRetainedContentNativeVisuals({
  rowHoverTarget,
  scene,
}: {
  readonly rowHoverTarget: GpuRetainedContentRowHoverTarget | null;
  readonly scene: GpuFlowScene;
}) {
  return [
    ...getGpuRetainedContentScrollbarVisuals(scene.contentSurfaces),
    ...getGpuRetainedContentRowHoverVisuals({
      scene,
      target: rowHoverTarget,
    }),
  ];
}

function beginGpuFlowRetainedContentSwitchClickAnimation({
  event,
  switchAnimations,
}: {
  readonly event: GpuRetainedContentInteractionHit;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  if (event.hit.kind !== "control") {
    return;
  }
  const row = event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
  if (row?.control?.kind !== "switch") {
    return;
  }
  switchAnimations.beginTransition({
    fromChecked: row.control.checked,
    rowId: row.id,
    surfaceId: event.surfaceId,
    toChecked: !row.control.checked,
  });
}

function shouldHandleGpuFlowRetainedContentDragMoveHit(
  options: GpuFlowRetainedContentInteractionOptions | null,
  hit: GpuRetainedContentInteractionHit,
): boolean {
  if (!options) {
    return shouldHandleGpuFlowRetainedContentPointerMoveHit(options, hit);
  }
  const handled = options.shouldHandleDragMoveHit?.(hit);
  return (
    handled ?? shouldHandleGpuFlowRetainedContentPointerMoveHit(options, hit)
  );
}

function shouldHandleGpuFlowRetainedContentPointerMoveHit(
  options: GpuFlowRetainedContentInteractionOptions | null,
  hit: GpuRetainedContentInteractionHit,
): boolean {
  if (!options) {
    return shouldHandleGpuFlowRetainedContentHit(options, hit);
  }
  const handled = options.shouldHandlePointerMoveHit?.(hit);
  return handled ?? shouldHandleGpuFlowRetainedContentHit(options, hit);
}

function shouldHandleGpuFlowRetainedContentHit(
  options: GpuFlowRetainedContentInteractionOptions | null,
  hit: GpuRetainedContentInteractionHit,
): boolean {
  if (!options) {
    return true;
  }
  return options.shouldHandleHit?.(hit) ?? true;
}

function applyGpuFlowRetainedContentScrollbarVisualState({
  getNativeVisuals,
  nodeLayerRef,
  surfaceRef,
  visualState,
}: {
  readonly getNativeVisuals: (
    scene: GpuFlowScene,
  ) => NonNullable<
    GpuFlowRetainedContentNodeLayerState["htmlSurfaceNativeVisuals"]
  >;
  readonly nodeLayerRef: MutableRefObject<GpuFlowRetainedContentNodeLayerState>;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly visualState: GpuRetainedContentScrollbarVisualState;
}) {
  const scene = nodeLayerRef.current.scene;
  if (!scene) {
    return;
  }
  const update = applyGpuRetainedContentScrollbarVisualStateToScene({
    scene,
    visualState,
  });
  if (!update) {
    return;
  }
  nodeLayerRef.current = {
    ...nodeLayerRef.current,
    edgeLabelSurfaces: mergeGpuFlowRetainedContentSurfaceLayouts({
      overlays: nodeLayerRef.current.edgeLabelSurfaces,
      scene: update.scene,
    }),
    htmlSurfaceNativeVisuals: getNativeVisuals(update.scene),
    scene: update.scene,
  };
  surfaceRef.current?.requestFrame("manual");
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

function areGpuFlowRetainedContentScrollbarVisualStatesEqual(
  left: GpuRetainedContentScrollbarVisualState,
  right: GpuRetainedContentScrollbarVisualState,
): boolean {
  return (
    areGpuFlowRetainedContentScrollbarVisualTargetsEqual(
      left.activeTarget,
      right.activeTarget,
    ) &&
    areGpuFlowRetainedContentScrollbarVisualTargetsEqual(
      left.hoveredTarget,
      right.hoveredTarget,
    )
  );
}

function areGpuFlowRetainedContentScrollbarVisualTargetsEqual(
  left: GpuRetainedContentScrollbarVisualTarget | null,
  right: GpuRetainedContentScrollbarVisualTarget | null,
): boolean {
  return (
    left?.axis === right?.axis &&
    left?.part === right?.part &&
    left?.surfaceId === right?.surfaceId
  );
}
