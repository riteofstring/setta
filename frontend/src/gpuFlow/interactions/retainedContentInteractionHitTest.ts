import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import {
  hitTestGpuRetainedContentProjectedRuntimeFrame,
  hitTestGpuRetainedContentSampledScene,
  type GpuRetainedContentHitTarget,
} from "../retainedContentHitTest";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowScene } from "../scene";
import { screenToFlowPosition, type GpuPoint } from "../viewportMath";
import { getRegisteredGpuFlowViewportRuntime } from "../viewportRuntimeRegistry";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";

export type GpuRetainedContentInteractionHit = GpuRetainedContentHitTarget & {
  readonly screenPoint: GpuPoint;
};

type GpuRetainedContentInteractionHitContext = {
  readonly domNode: HTMLElement;
  readonly scene: GpuFlowScene;
};

type GpuRetainedContentInteractionHitRuntimeInput = {
  readonly currentScrollOffsets: GpuRetainedContentScrollOffsetMap | undefined;
  readonly flowPoint: GpuPoint;
  readonly hasRetainedRuntimeFrameProvider: boolean;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly scene: GpuFlowScene;
  readonly screenPoint: GpuPoint;
  readonly useCurrentRetainedScene: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export function hitTestGpuRetainedContentInteraction({
  element,
  event,
  forceCurrentScene = false,
  getScene,
  getRetainedRuntimeFrame,
  getScrollOffsets,
  getVisibleProjectionState,
  store = gpuFlowViewportStore,
}: {
  readonly element?: HTMLElement | undefined;
  readonly event: Pick<PointerEvent, "clientX" | "clientY">;
  readonly forceCurrentScene?: boolean | undefined;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly getRetainedRuntimeFrame?:
    | (() => GpuRetainedRuntimeFrame | null | undefined)
    | undefined;
  readonly getScrollOffsets?:
    | (() => GpuRetainedContentScrollOffsetMap)
    | undefined;
  readonly getVisibleProjectionState?:
    | (() => GpuFlowVisibleProjectionState | null | undefined)
    | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
}): GpuRetainedContentInteractionHit | null {
  const context = resolveGpuRetainedContentInteractionHitContext({
    element,
    getScene,
    store,
  });
  if (!context) {
    return null;
  }
  const hitInput = resolveGpuRetainedContentInteractionHitRuntimeInput({
    context,
    event,
    forceCurrentScene,
    getRetainedRuntimeFrame,
    getScrollOffsets,
    getVisibleProjectionState,
    store,
  });
  const hit = hitTestGpuRetainedContentInteractionFrame(hitInput);
  return hit ? { ...hit, screenPoint: hitInput.screenPoint } : null;
}

function resolveGpuRetainedContentInteractionHitContext({
  element,
  getScene,
  store,
}: {
  readonly element: HTMLElement | undefined;
  readonly getScene: () => GpuFlowScene | undefined;
  readonly store: GpuFlowViewportStoreApi;
}): GpuRetainedContentInteractionHitContext | null {
  const scene = getScene();
  const domNode = element ?? store.getState().domNode;
  if (!scene || !domNode) {
    return null;
  }
  return { domNode, scene };
}

function resolveGpuRetainedContentInteractionHitRuntimeInput({
  context,
  event,
  forceCurrentScene,
  getRetainedRuntimeFrame,
  getScrollOffsets,
  getVisibleProjectionState,
  store,
}: {
  readonly context: GpuRetainedContentInteractionHitContext;
  readonly event: Pick<PointerEvent, "clientX" | "clientY">;
  readonly forceCurrentScene: boolean;
  readonly getRetainedRuntimeFrame:
    | (() => GpuRetainedRuntimeFrame | null | undefined)
    | undefined;
  readonly getScrollOffsets:
    | (() => GpuRetainedContentScrollOffsetMap)
    | undefined;
  readonly getVisibleProjectionState:
    | (() => GpuFlowVisibleProjectionState | null | undefined)
    | undefined;
  readonly store: GpuFlowViewportStoreApi;
}): GpuRetainedContentInteractionHitRuntimeInput {
  const screenPoint = getEventPointRelativeToElement(event, context.domNode);
  const visibleProjectionState = getVisibleProjectionState?.() ?? null;
  const retainedRuntimeFrame = getRetainedRuntimeFrame?.() ?? null;
  const currentScrollOffsets = getScrollOffsets?.();
  const useCurrentRetainedScene = resolveUseCurrentRetainedScene({
    currentScrollOffsets,
    forceCurrentScene,
    getRetainedRuntimeFrame,
    retainedRuntimeFrame,
    scene: context.scene,
    visibleProjectionState,
  });
  const flowPoint = screenToFlowPosition(
    screenPoint,
    resolveHitTestViewport({
      store,
      useCurrentRetainedScene,
      visibleProjectionState,
    }),
  );
  return {
    currentScrollOffsets,
    flowPoint,
    hasRetainedRuntimeFrameProvider: getRetainedRuntimeFrame !== undefined,
    retainedRuntimeFrame,
    scene: context.scene,
    screenPoint,
    useCurrentRetainedScene,
    visibleProjectionState,
  };
}

function resolveUseCurrentRetainedScene({
  currentScrollOffsets,
  forceCurrentScene,
  getRetainedRuntimeFrame,
  retainedRuntimeFrame,
  scene,
  visibleProjectionState,
}: {
  readonly currentScrollOffsets: GpuRetainedContentScrollOffsetMap | undefined;
  readonly forceCurrentScene: boolean;
  readonly getRetainedRuntimeFrame:
    | (() => GpuRetainedRuntimeFrame | null | undefined)
    | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly scene: GpuFlowScene;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): boolean {
  if (forceCurrentScene) {
    return true;
  }
  if (!visibleProjectionState) {
    return false;
  }
  return shouldHitTestCurrentRetainedScene({
    currentScrollOffsets,
    retainedRuntimeFrame:
      getRetainedRuntimeFrame !== undefined ? retainedRuntimeFrame : undefined,
    scene,
    visibleProjectionState,
  });
}

function resolveHitTestViewport({
  store,
  useCurrentRetainedScene,
  visibleProjectionState,
}: {
  readonly store: GpuFlowViewportStoreApi;
  readonly useCurrentRetainedScene: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleProjectionState["sample"]["viewport"] {
  const runtimeViewport =
    getRegisteredGpuFlowViewportRuntime(store)?.getViewportTuple();
  const liveViewport = runtimeViewport ?? store.getState().transform;
  if (useCurrentRetainedScene) {
    return liveViewport;
  }
  return visibleProjectionState?.sample.viewport ?? liveViewport;
}

function hitTestGpuRetainedContentInteractionFrame({
  currentScrollOffsets,
  flowPoint,
  hasRetainedRuntimeFrameProvider,
  retainedRuntimeFrame,
  scene,
  useCurrentRetainedScene,
  visibleProjectionState,
}: GpuRetainedContentInteractionHitRuntimeInput): GpuRetainedContentHitTarget | null {
  if (useCurrentRetainedScene) {
    return hitTestGpuRetainedContentSampledScene({
      point: flowPoint,
      scene,
      scrollOffsets: currentScrollOffsets,
    });
  }
  if (visibleProjectionState) {
    return hitTestGpuRetainedContentInteractionVisibleProjection({
      currentScrollOffsets,
      flowPoint,
      scene,
      useCurrentRetainedScene,
      visibleProjectionState,
    });
  }
  if (retainedRuntimeFrame) {
    return hitTestGpuRetainedContentSampledScene({
      point: flowPoint,
      scene,
      scrollOffsets: currentScrollOffsets,
    });
  }
  if (hasRetainedRuntimeFrameProvider) {
    return null;
  }
  return hitTestGpuRetainedContentSampledScene({
    point: flowPoint,
    scene,
    scrollOffsets: currentScrollOffsets,
  });
}

function hitTestGpuRetainedContentInteractionVisibleProjection({
  currentScrollOffsets,
  flowPoint,
  scene,
  useCurrentRetainedScene,
  visibleProjectionState,
}: {
  readonly currentScrollOffsets: GpuRetainedContentScrollOffsetMap | undefined;
  readonly flowPoint: GpuPoint;
  readonly scene: GpuFlowScene;
  readonly useCurrentRetainedScene: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuRetainedContentHitTarget | null {
  if (useCurrentRetainedScene) {
    return hitTestGpuRetainedContentSampledScene({
      point: flowPoint,
      scene,
      scrollOffsets: currentScrollOffsets,
    });
  }
  return hitTestGpuRetainedContentProjectedRuntimeFrame({
    frame: visibleProjectionState.committedFrame.retainedRuntimeFrame,
    point: flowPoint,
    scrollOffsets: visibleProjectionState.sample.retainedScrollOffsets,
  });
}

function shouldHitTestCurrentRetainedScene({
  currentScrollOffsets,
  retainedRuntimeFrame,
  scene,
  visibleProjectionState,
}: {
  readonly currentScrollOffsets: GpuRetainedContentScrollOffsetMap | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
  readonly scene: GpuFlowScene;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): boolean {
  return (
    isStartupCommittedRetainedFrame(visibleProjectionState) ||
    (retainedRuntimeFrame !== undefined &&
      retainedRuntimeFrame !==
        visibleProjectionState.committedFrame.retainedRuntimeFrame) ||
    scene.revision !==
      visibleProjectionState.committedFrame.retainedRuntimeFrame.input
        .sceneRevision ||
    (currentScrollOffsets !== undefined &&
      !areRetainedScrollOffsetMapsEqual(
        currentScrollOffsets,
        visibleProjectionState.sample.retainedScrollOffsets,
      ))
  );
}

function isStartupCommittedRetainedFrame(
  visibleProjectionState: GpuFlowVisibleProjectionState,
): boolean {
  return (
    visibleProjectionState.committedFrame.displayFrameId === 0 &&
    visibleProjectionState.committedFrame.retainedDisplayFrame === null
  );
}

function areRetainedScrollOffsetMapsEqual(
  left: GpuRetainedContentScrollOffsetMap,
  right: GpuRetainedContentScrollOffsetMap,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [surfaceId, leftOffset] of left) {
    const rightOffset = right.get(surfaceId);
    if (
      !rightOffset ||
      leftOffset.x !== rightOffset.x ||
      leftOffset.y !== rightOffset.y
    ) {
      return false;
    }
  }
  return true;
}

function getEventPointRelativeToElement(
  event: Pick<PointerEvent, "clientX" | "clientY">,
  element: HTMLElement,
): GpuPoint {
  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}
