import { useEffect, useRef, type MutableRefObject } from "react";

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
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  areGpuRetainedContentRowHoverTargetsEqual,
  type GpuRetainedContentRowHoverTarget,
} from "../retainedContentRowHover";
import {
  commitGpuRetainedContentRuntimeScrollResult,
  getGpuRetainedContentRuntimeScrollOffsets,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import type { GpuRetainedContentScrollResult } from "../retainedContentScroll";
import {
  getGpuRetainedContentScrollbarVisualTarget,
  isGpuRetainedContentScrollbarHit,
  isGpuRetainedContentScrollbarThumbHit,
  resolveGpuRetainedContentScrollbarThumbDrag,
  resolveGpuRetainedContentScrollbarTrackClick,
  type GpuRetainedContentScrollbarVisualState,
  type GpuRetainedContentScrollbarVisualTarget,
} from "../retainedContentScrollbar";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  type GpuFlowRetainedContentNodeLayerState,
  type GpuFlowRetainedContentPageManager,
  type GpuFlowRetainedContentTextureManager,
} from "./retainedContentControllerSurfaceUpdates";

export type GpuFlowRetainedContentConnectionOptions =
  | false
  | Omit<
      GpuRetainedContentConnectionControllerOptions,
      | "element"
      | "getScene"
      | "getVisibleProjectionState"
      | "layoutStore"
      | "store"
    >
  | undefined;

export type GpuFlowRetainedContentInteractionOptions =
  | false
  | Omit<
      GpuRetainedContentInteractionControllerOptions,
      | "element"
      | "getScene"
      | "getRetainedRuntimeFrame"
      | "getScrollOffsets"
      | "getVisibleProjectionState"
      | "interactionDiagnostics"
      | "requestFrame"
      | "store"
    >
  | undefined;

export type GpuFlowRetainedContentScrollOptions =
  | false
  | (Omit<
      GpuRetainedContentScrollControllerOptions,
      | "element"
      | "getRetainedRuntimeFrame"
      | "getScene"
      | "getScrollOffsets"
      | "onScrollOffsetsChange"
      | "requestFrame"
      | "store"
    > & {
      readonly onScrollOffsetsCommit?:
        | ((
            scrollOffsets: ReadonlyMap<
              string,
              { readonly x: number; readonly y: number }
            >,
            result: GpuRetainedContentScrollResult,
          ) => void)
        | undefined;
    })
  | undefined;

export type GpuFlowRetainedContentKeyboardOptions =
  | false
  | Omit<
      GpuRetainedContentKeyboardControllerOptions,
      "element" | "getScene" | "getScrollOffsets" | "requestFrame"
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
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly visibleProjectionStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
  readonly retainedContentScroll: GpuFlowRetainedContentScrollOptions;
  readonly retainedContentSwitchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly scenePortConnection: GpuFlowScenePortConnectionOptions;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<GpuFlowRetainedContentTextureManager | null>;
  readonly viewportRuntime: GpuFlowViewportRuntime;
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
  retainedContentRuntimeState,
  visibleProjectionStateRef,
  retainedContentScroll,
  retainedContentSwitchAnimations,
  scenePortConnection,
  surfaceRef,
  textureManagerRef,
  viewportRuntime,
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
      getRetainedRuntimeFrame: () =>
        nodeLayerRef.current.retainedRuntimeFrame ?? null,
      getVisibleProjectionState: () => visibleProjectionStateRef.current,
      getScene: () => nodeLayerRef.current.scene,
      layoutStore,
      store: viewportStore,
    });
  }, [
    containerRef,
    layoutStore,
    nodeLayerRef,
    retainedContentConnection,
    visibleProjectionStateRef,
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
    let retainedContentRowHoverFrameTimeout: ReturnType<
      typeof setTimeout
    > | null = null;
    const clearRetainedContentRowHoverFrameTimeout = () => {
      if (retainedContentRowHoverFrameTimeout === null) {
        return;
      }
      clearTimeout(retainedContentRowHoverFrameTimeout);
      retainedContentRowHoverFrameTimeout = null;
    };
    const requestRetainedContentRowHoverFrame = (
      target: GpuRetainedContentRowHoverTarget | null,
    ) => {
      if (!viewportStore.getState().retainedContentScrolling) {
        surfaceRef.current?.requestFrame(
          target ? "retained-row-hover-visual" : "retained-row-hover-clear",
        );
      }
      clearRetainedContentRowHoverFrameTimeout();
      if (!target) {
        return;
      }
      retainedContentRowHoverFrameTimeout = setTimeout(() => {
        retainedContentRowHoverFrameTimeout = null;
        if (
          !areGpuRetainedContentRowHoverTargetsEqual(
            retainedContentRowHoverTargetRef.current,
            target,
          ) ||
          viewportStore.getState().retainedContentScrolling
        ) {
          if (
            areGpuRetainedContentRowHoverTargetsEqual(
              retainedContentRowHoverTargetRef.current,
              target,
            ) &&
            viewportStore.getState().retainedContentScrolling
          ) {
            requestRetainedContentRowHoverFrame(target);
          }
          return;
        }
        surfaceRef.current?.requestFrame("retained-row-hover-visual");
      }, 80);
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
      nodeLayerRef.current = {
        ...nodeLayerRef.current,
        retainedContentScrollbarVisualState,
      };
      updateGpuFlowRetainedContentRuntimeNativeVisuals({
        nodeLayerRef,
        retainedContentRuntimeState,
      });
      surfaceRef.current?.requestFrame("manual");
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
      const targetChanged = !areGpuRetainedContentRowHoverTargetsEqual(
        retainedContentRowHoverTargetRef.current,
        nextTarget,
      );
      retainedContentRowHoverTargetRef.current = nextTarget;
      if (nodeLayerRef.current.retainedContentRowHoverTarget !== nextTarget) {
        nodeLayerRef.current = {
          ...nodeLayerRef.current,
          retainedContentRowHoverTarget: nextTarget,
        };
      }
      if (!targetChanged) {
        return;
      }
      updateGpuFlowRetainedContentRuntimeNativeVisuals({
        nodeLayerRef,
        retainedContentRuntimeState,
      });
      requestRetainedContentRowHoverFrame(nextTarget);
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
      const scrollResult = {
        changed: true,
        scrollOffsets: result.scrollOffsets,
        surfaceId: result.surfaceId,
      };
      commitGpuRetainedContentRuntimeScrollResult({
        result: scrollResult,
        state: retainedContentRuntimeState,
      });
      retainedContentScrollbarScroll.onScrollOffsetsCommit?.(
        result.scrollOffsets,
        scrollResult,
      );
      requestGpuFlowRetainedContentRuntimeScrollFrameOnChanges({
        previousScrollOffsets: new Map(),
        retainedContentRuntimeState,
        surfaceRef,
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
        getRetainedRuntimeFrame: () =>
          nodeLayerRef.current.retainedRuntimeFrame ?? null,
        getVisibleProjectionState: () => visibleProjectionStateRef.current,
        getScrollOffsets: () =>
          getGpuRetainedContentRuntimeScrollOffsets(
            retainedContentRuntimeState,
          ),
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
              scrollOffsets: getGpuRetainedContentRuntimeScrollOffsets(
                retainedContentRuntimeState,
              ),
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
          const switchAnimationStarted =
            beginGpuFlowRetainedContentSwitchClickAnimation({
              event,
              switchAnimations: retainedContentSwitchAnimations,
            });
          if (switchAnimationStarted) {
            surfaceRef.current?.requestFrame("retained-native-visual");
          }
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
          const previousScrollOffsets =
            getGpuRetainedContentRuntimeScrollOffsets(
              retainedContentRuntimeState,
            );
          const changed =
            retainedContentInteraction?.onHitDragFrame?.(event) ?? false;
          const appliedRuntimeScroll =
            requestGpuFlowRetainedContentRuntimeScrollFrameOnChanges({
              previousScrollOffsets,
              retainedContentRuntimeState,
              surfaceRef,
            });
          return appliedRuntimeScroll || changed;
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
              scrollOffsets: getGpuRetainedContentRuntimeScrollOffsets(
                retainedContentRuntimeState,
              ),
            });
            if (result.changed) {
              commitRetainedContentScrollbarScrollResult(result);
            }
            return result.changed;
          }
          const previousScrollOffsets =
            getGpuRetainedContentRuntimeScrollOffsets(
              retainedContentRuntimeState,
            );
          retainedContentInteraction?.onHitDragMove?.(event);
          requestGpuFlowRetainedContentRuntimeScrollFrameOnChanges({
            previousScrollOffsets,
            retainedContentRuntimeState,
            surfaceRef,
          });
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
      clearRetainedContentRowHoverFrameTimeout();
      detachRetainedContentInteractionController();
    };
  }, [
    containerRef,
    interactionDiagnosticsRef,
    nodeLayerRef,
    retainedContentInteractionEnabled,
    retainedContentSwitchAnimations,
    retainedContentRuntimeState,
    retainedContentPageManagerRef,
    nodeElementByIdRef,
    surfaceRef,
    textureManagerRef,
    visibleProjectionStateRef,
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
      getScrollOffsets: () =>
        getGpuRetainedContentRuntimeScrollOffsets(retainedContentRuntimeState),
      onNavigation: (event) => {
        commitGpuRetainedContentRuntimeScrollResult({
          result: event,
          state: retainedContentRuntimeState,
        });
        retainedContentKeyboard.onNavigation(event);
        requestGpuFlowRetainedContentRuntimeScrollFrameOnChanges({
          previousScrollOffsets: new Map(),
          retainedContentRuntimeState,
          surfaceRef,
        });
      },
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
    });
  }, [
    containerRef,
    nodeElementByIdRef,
    nodeLayerRef,
    retainedContentKeyboard,
    retainedContentPageManagerRef,
    retainedContentRuntimeState,
    retainedContentSwitchAnimations,
    surfaceRef,
    textureManagerRef,
    viewportRuntime,
    viewportStore,
  ]);

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
      getRetainedRuntimeFrame: () =>
        nodeLayerRef.current.retainedRuntimeFrame ?? null,
      getScene: () => nodeLayerRef.current.scene,
      getScrollOffsets: () =>
        getGpuRetainedContentRuntimeScrollOffsets(retainedContentRuntimeState),
      onScrollOffsetsChange: (scrollOffsets, result) => {
        commitGpuRetainedContentRuntimeScrollResult({
          result,
          state: retainedContentRuntimeState,
        });
        retainedContentScroll.onScrollOffsetsCommit?.(scrollOffsets, result);
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
    retainedContentRuntimeState,
    retainedContentPageManagerRef,
    surfaceRef,
    textureManagerRef,
    viewportRuntime,
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

function requestGpuFlowRetainedContentRuntimeScrollFrameOnChanges({
  previousScrollOffsets,
  retainedContentRuntimeState,
  surfaceRef,
}: {
  readonly previousScrollOffsets: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): boolean {
  const scrollOffsets = getGpuRetainedContentRuntimeScrollOffsets(
    retainedContentRuntimeState,
  );
  if (
    !haveGpuFlowRetainedContentRuntimeScrollOffsetsChanged({
      previousScrollOffsets,
      scrollOffsets,
    })
  ) {
    return false;
  }
  surfaceRef.current?.requestFrame("retained-scroll");
  return true;
}

function haveGpuFlowRetainedContentRuntimeScrollOffsetsChanged({
  previousScrollOffsets,
  scrollOffsets,
}: {
  readonly previousScrollOffsets: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
  readonly scrollOffsets: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
}): boolean {
  if (previousScrollOffsets.size !== scrollOffsets.size) {
    return true;
  }
  for (const [surfaceId, scrollOffset] of scrollOffsets) {
    const previous = previousScrollOffsets.get(surfaceId);
    if (
      !previous ||
      previous.x !== scrollOffset.x ||
      previous.y !== scrollOffset.y
    ) {
      return true;
    }
  }
  return false;
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

function updateGpuFlowRetainedContentRuntimeNativeVisuals({
  nodeLayerRef,
  retainedContentRuntimeState,
}: {
  readonly nodeLayerRef: MutableRefObject<GpuFlowRetainedContentNodeLayerState>;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
}) {
  const scene = nodeLayerRef.current.scene;
  if (!scene) {
    return;
  }
  const scrollOffsets = getGpuRetainedContentRuntimeScrollOffsets(
    retainedContentRuntimeState,
  );
  nodeLayerRef.current = {
    ...nodeLayerRef.current,
    retainedContentRuntimeScrollOffsets: scrollOffsets,
  };
}

function beginGpuFlowRetainedContentSwitchClickAnimation({
  event,
  switchAnimations,
}: {
  readonly event: GpuRetainedContentInteractionHit;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}): boolean {
  if (event.hit.kind !== "control") {
    return false;
  }
  const row = event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
  if (row?.control?.kind !== "switch") {
    return false;
  }
  switchAnimations.beginTransition({
    fromChecked: row.control.checked,
    rowId: row.id,
    surfaceId: event.surfaceId,
    toChecked: !row.control.checked,
  });
  return true;
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
