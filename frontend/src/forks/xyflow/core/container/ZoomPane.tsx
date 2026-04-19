import { interpolate } from "d3-interpolate";
import { pointer, select, type Selection as D3Selection } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import { useDndState } from "forks/dnd-kit/dndState";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { useAIFollow, useMisc, useSettings } from "state/definitions";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { PanOnScrollModeEnum } from "utils/generatedTypes";
import { clamp, isMacOs } from "utils/utils";
import { shallow } from "zustand/shallow";
import { getViewport } from "../hooks/useViewportHelper";
import { infiniteExtent } from "../store/initialState";
import { fitView } from "../store/utils";
import type { CoordinateExtent, ReactFlowState, Viewport } from "../types";
import { getWheelDelta } from "../utils";

type InternalWheelEvent = WheelEvent & { internal?: boolean };
type ZoomFilterEvent = MouseEvent | TouchEvent | WheelEvent;
type ZoomSourceEvent = ZoomFilterEvent & { internal?: boolean };
type ScaleToFn = (
  selection: D3Selection<Element, unknown, null, undefined>,
  zoomLevel: number,
  point?: [number, number],
  event?: WheelEvent,
) => void;
type TranslateByFn = (
  selection: D3Selection<Element, unknown, null, undefined>,
  deltaX: number,
  deltaY: number,
  event?: InternalWheelEvent,
) => void;

type ZoomPaneProps = {
  zoomOnScroll?: boolean;
  zoomOnPinch?: boolean;
  panOnScroll?: boolean;
  panOnScrollSpeed?: number;
  panOnScrollMode?: PanOnScrollModeEnum;
  zoomOnDoubleClick?: boolean;
  panOnDrag?: boolean | number[];
  zoomActivationKeyPressed?: boolean;
  translateExtent?: CoordinateExtent;
  preventScrolling?: boolean;
  children: ReactNode;
  wrapperDimensions: { width: number; height: number };
};

type ZoomPaneInitParams = {
  zoomPane: RefObject<HTMLDivElement>;
  translateExtent: CoordinateExtent;
  initialViewport: Viewport;
};

type ViewportInteractionFlags = {
  isPanScrolling: boolean;
  isWheelZooming: boolean;
  isZoomingOrPanning: boolean;
};

type ViewportInteractionRefs = {
  isPanScrolling: { current: boolean };
  isWheelZooming: { current: boolean };
  isZoomingOrPanning: { current: boolean };
};

type ViewportInteractionCleanupRefs = ViewportInteractionRefs & {
  panScrollTimeout: { current: ReturnType<typeof setTimeout> | undefined };
  wheelZoomTimeout: { current: ReturnType<typeof setTimeout> | undefined };
};

type ViewportTransform = ReactFlowState["transform"];

type ViewportTransformFrameHandle = ReturnType<typeof setTimeout> | number;

type QueuedViewportTransformUpdateRefs = {
  frameId: { current: ViewportTransformFrameHandle | null };
  pendingTransform: { current: ViewportTransform | null };
};

type PanOnScrollDelta = {
  deltaX: number;
  deltaY: number;
};

type PinchZoomCheck = {
  event: Pick<WheelEvent, "ctrlKey">;
  zoomOnPinch: boolean;
  isMacOS: boolean;
};

type PanOnScrollWheelHandlerParams = {
  d3Selection: D3Selection<Element, unknown, null, undefined>;
  interactionRefs: ViewportInteractionCleanupRefs;
  panOnScrollMode: PanOnScrollModeEnum;
  panOnScrollSpeed: number;
  scaleTo: ScaleToFn;
  translateBy: TranslateByFn;
  zoomActivationKeyPressed?: boolean;
  zoomOnPinch: boolean;
};

type DefaultWheelHandlerParams = {
  d3Selection: NonNullable<ReactFlowState["d3Selection"]>;
  d3Zoom: NonNullable<ReactFlowState["d3Zoom"]>;
  d3ZoomHandler: ReactFlowState["d3ZoomHandler"];
  interactionRefs: ViewportInteractionCleanupRefs;
  preventScrolling: boolean;
  viewportTransformRefs: QueuedViewportTransformUpdateRefs;
  zoomActivationKeyPressed?: boolean;
  zoomOnPinch: boolean;
};

type ZoomFilterParams = {
  event: ZoomFilterEvent;
  panOnDrag: boolean | number[];
  panOnScroll: boolean;
  userSelectionActive: boolean;
  zoomActivationKeyPressed?: boolean;
  zoomOnDoubleClick: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
};

type ViewportEventMetadata = {
  button: number;
  classNameMatches: Record<string, boolean | undefined>;
  isMacOS: boolean;
  targetElement: Element | null;
};

const defaultZoomPaneProps = {
  zoomOnScroll: true,
  zoomOnPinch: true,
  panOnScroll: false,
  panOnScrollSpeed: 0.5,
  panOnScrollMode: PanOnScrollModeEnum.free,
  zoomOnDoubleClick: true,
  panOnDrag: true,
  translateExtent: infiniteExtent,
  preventScrolling: true,
} satisfies Pick<
  ZoomPaneProps,
  | "zoomOnScroll"
  | "zoomOnPinch"
  | "panOnScroll"
  | "panOnScrollSpeed"
  | "panOnScrollMode"
  | "zoomOnDoubleClick"
  | "panOnDrag"
  | "translateExtent"
  | "preventScrolling"
>;

const viewportEventMetadataCache = new WeakMap<Event, ViewportEventMetadata>();

function getViewportEventMetadata(event: Event): ViewportEventMetadata {
  const cachedMetadata = viewportEventMetadataCache.get(event);
  if (cachedMetadata) {
    return cachedMetadata;
  }

  const target = event.target;
  const metadata: ViewportEventMetadata = {
    button: "button" in event ? event.button : 0,
    classNameMatches: Object.create(null) as Record<string, boolean | undefined>,
    isMacOS: isMacOs(),
    targetElement: target instanceof Element ? target : null,
  };
  viewportEventMetadataCache.set(event, metadata);
  return metadata;
}

const isWrappedWithClass = (event: Event, className?: string): boolean => {
  if (!className) {
    return false;
  }
  const metadata = getViewportEventMetadata(event);
  const cachedMatch = metadata.classNameMatches[className];
  if (typeof cachedMatch === "boolean") {
    return cachedMatch;
  }
  const nextMatch = metadata.targetElement?.closest(`.${className}`) !== null;
  metadata.classNameMatches[className] = nextMatch;
  return nextMatch;
};

const getEventButton = (event: ZoomFilterEvent): number =>
  getViewportEventMetadata(event).button;

const isPointerStartEvent = (eventType: string): boolean =>
  eventType === "mousedown" || eventType === "touchstart";

const isWheelEventType = (eventType: string): boolean => eventType === "wheel";

export function getViewportInteractionActiveValue({
  isPanScrolling,
  isWheelZooming,
  isZoomingOrPanning,
}: ViewportInteractionFlags): boolean {
  return isPanScrolling || isWheelZooming || isZoomingOrPanning;
}

function syncViewportInteractionActive({
  isPanScrolling,
  isWheelZooming,
  isZoomingOrPanning,
}: ViewportInteractionRefs) {
  useReactFlow.setState({
    viewportInteractionActive: getViewportInteractionActiveValue({
      isPanScrolling: isPanScrolling.current,
      isWheelZooming: isWheelZooming.current,
      isZoomingOrPanning: isZoomingOrPanning.current,
    }),
  });
}

function areViewportTransformsEqual(
  left: ViewportTransform,
  right: ViewportTransform,
): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function commitViewportTransform(nextTransform: ViewportTransform) {
  const currentTransform = useReactFlow.getState().transform;
  if (areViewportTransformsEqual(currentTransform, nextTransform)) {
    return;
  }

  useReactFlow.setState({
    transform: nextTransform,
  });
}

function requestViewportTransformFrame(callback: FrameRequestCallback) {
  if (
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
  ) {
    return window.requestAnimationFrame(callback);
  }

  return setTimeout(() => callback(Date.now()), 16);
}

function cancelViewportTransformFrame(
  frameId: ViewportTransformFrameHandle | null,
) {
  if (frameId === null) {
    return;
  }

  if (
    typeof window !== "undefined" &&
    typeof window.cancelAnimationFrame === "function"
  ) {
    window.cancelAnimationFrame(frameId as number);
    return;
  }

  clearTimeout(frameId);
}

function queueViewportTransformUpdate(
  transformRefs: QueuedViewportTransformUpdateRefs,
  nextTransform: ViewportTransform,
) {
  transformRefs.pendingTransform.current = nextTransform;
  if (transformRefs.frameId.current !== null) {
    return;
  }

  transformRefs.frameId.current = requestViewportTransformFrame(() => {
    transformRefs.frameId.current = null;
    const pendingTransform = transformRefs.pendingTransform.current;
    transformRefs.pendingTransform.current = null;
    if (!pendingTransform) {
      return;
    }

    commitViewportTransform(pendingTransform);
  });
}

function flushViewportTransformUpdate(
  transformRefs: QueuedViewportTransformUpdateRefs,
  nextTransform?: ViewportTransform,
) {
  if (nextTransform) {
    transformRefs.pendingTransform.current = nextTransform;
  }

  cancelViewportTransformFrame(transformRefs.frameId.current);
  transformRefs.frameId.current = null;

  const pendingTransform = transformRefs.pendingTransform.current;
  transformRefs.pendingTransform.current = null;
  if (!pendingTransform) {
    return;
  }

  commitViewportTransform(pendingTransform);
}

function clearViewportTransformUpdate(
  transformRefs: QueuedViewportTransformUpdateRefs,
) {
  cancelViewportTransformFrame(transformRefs.frameId.current);
  transformRefs.frameId.current = null;
  transformRefs.pendingTransform.current = null;
}

function readCurrentViewportTransform(
  d3Selection: ReactFlowState["d3Selection"],
): ViewportTransform {
  const currentZoomTransform = d3Selection?.property("__zoom") as
    | { x: number; y: number; k: number }
    | undefined;
  if (
    currentZoomTransform &&
    Number.isFinite(currentZoomTransform.x) &&
    Number.isFinite(currentZoomTransform.y) &&
    Number.isFinite(currentZoomTransform.k)
  ) {
    return [
      currentZoomTransform.x,
      currentZoomTransform.y,
      currentZoomTransform.k,
    ];
  }

  return useReactFlow.getState().transform;
}

function syncSelectionViewportTransform(
  d3Selection: NonNullable<ReactFlowState["d3Selection"]>,
  nextTransform: ViewportTransform,
) {
  d3Selection.property(
    "__zoom",
    zoomIdentity.translate(nextTransform[0], nextTransform[1]).scale(
      nextTransform[2],
    ),
  );
}

export function resolveDirectWheelViewportTransform({
  currentTransform,
  d3Zoom,
  event,
  target,
  translateExtent,
  viewportExtent,
}: {
  currentTransform: ViewportTransform;
  d3Zoom: NonNullable<ReactFlowState["d3Zoom"]>;
  event: WheelEvent;
  target: Element;
  translateExtent: CoordinateExtent;
  viewportExtent: CoordinateExtent;
}): ViewportTransform | null {
  const viewportWidth = viewportExtent[1][0] - viewportExtent[0][0];
  const viewportHeight = viewportExtent[1][1] - viewportExtent[0][1];
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }

  const currentZoom = currentTransform[2] || 1;
  const nextZoom = clamp(
    currentZoom * Math.pow(2, wheelDelta(event, getViewportEventMetadata(event).isMacOS)),
    ...d3Zoom.scaleExtent(),
  );
  const zoomRatio = nextZoom / currentZoom;
  const [pointerX, pointerY] = pointer(event, target);
  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
    return null;
  }

  const unconstrainedTransform = zoomIdentity
    .translate(
      pointerX - (pointerX - currentTransform[0]) * zoomRatio,
      pointerY - (pointerY - currentTransform[1]) * zoomRatio,
    )
    .scale(nextZoom);
  const constrainedTransform = d3Zoom.constrain()(
    unconstrainedTransform,
    viewportExtent,
    translateExtent,
  );

  return [
    constrainedTransform.x,
    constrainedTransform.y,
    constrainedTransform.k,
  ];
}

export function resetViewportInteractionState({
  isPanScrolling,
  isWheelZooming,
  isZoomingOrPanning,
  panScrollTimeout,
  wheelZoomTimeout,
}: ViewportInteractionCleanupRefs) {
  isPanScrolling.current = false;
  isWheelZooming.current = false;
  isZoomingOrPanning.current = false;
  clearTimeout(panScrollTimeout.current);
  clearTimeout(wheelZoomTimeout.current);
  useMisc.setState({ isPanScrolling: false });
  useReactFlow.setState({
    paneDragging: false,
    viewportInteractionActive: false,
  });
}

function shouldQueueViewportTransformEvent(
  sourceEvent: ZoomSourceEvent | null | undefined,
): boolean {
  return (
    sourceEvent?.type === "mousemove" ||
    sourceEvent?.type === "pointermove" ||
    sourceEvent?.type === "touchmove" ||
    sourceEvent?.type === "wheel"
  );
}

const wheelDelta = (event: WheelEvent, isMacOS: boolean) => {
  const factor = event.ctrlKey && isMacOS ? 10 : 1;

  return getWheelDelta(event, factor);
};

const selector = (s: ReactFlowState) => ({
  d3Zoom: s.d3Zoom,
  d3Selection: s.d3Selection,
  d3ZoomHandler: s.d3ZoomHandler,
  userSelectionActive: s.userSelectionActive,
  fitViewOnInit: s.fitViewOnInit,
  fitViewOnInitDone: s.fitViewOnInitDone,
  fitViewOnInitOptions: s.fitViewOnInitOptions,
});

function startWheelZoomBurst(interactionRefs: ViewportInteractionCleanupRefs) {
  clearTimeout(interactionRefs.wheelZoomTimeout.current);
  if (interactionRefs.isWheelZooming.current) {
    return;
  }
  interactionRefs.isWheelZooming.current = true;
  syncViewportInteractionActive(interactionRefs);
}

function scheduleWheelZoomBurstEnd(
  interactionRefs: ViewportInteractionCleanupRefs,
) {
  interactionRefs.wheelZoomTimeout.current = setTimeout(() => {
    interactionRefs.isWheelZooming.current = false;
    syncViewportInteractionActive(interactionRefs);
  }, 180);
}

function ensurePanScrollInteraction(
  interactionRefs: ViewportInteractionCleanupRefs,
) {
  if (interactionRefs.isPanScrolling.current) {
    return;
  }
  useMisc.setState({ isPanScrolling: true });
  interactionRefs.isPanScrolling.current = true;
  syncViewportInteractionActive(interactionRefs);
}

function schedulePanScrollInteractionEnd(
  interactionRefs: ViewportInteractionCleanupRefs,
) {
  clearTimeout(interactionRefs.panScrollTimeout.current);
  interactionRefs.panScrollTimeout.current = setTimeout(() => {
    interactionRefs.isPanScrolling.current = false;
    useMisc.setState({ isPanScrolling: false });
    syncViewportInteractionActive(interactionRefs);
  }, 150);
}

function isPinchZoomWheelEvent({
  event,
  zoomOnPinch,
  isMacOS,
}: PinchZoomCheck): boolean {
  return event.ctrlKey && zoomOnPinch && isMacOS;
}

export function resolvePanOnScrollDelta({
  event,
  isMacOS,
  panOnScrollMode,
}: {
  event: WheelEvent;
  isMacOS: boolean;
  panOnScrollMode: PanOnScrollModeEnum;
}): PanOnScrollDelta {
  const deltaNormalize = event.deltaMode === 1 ? 20 : 1;
  let deltaX =
    panOnScrollMode === PanOnScrollModeEnum.vertical
      ? 0
      : event.deltaX * deltaNormalize;
  let deltaY =
    panOnScrollMode === PanOnScrollModeEnum.horizontal
      ? 0
      : event.deltaY * deltaNormalize;

  if (
    !isMacOS &&
    event.shiftKey &&
    panOnScrollMode !== PanOnScrollModeEnum.vertical
  ) {
    deltaX = event.deltaY * deltaNormalize;
    deltaY = 0;
  }

  return { deltaX, deltaY };
}

function shouldSkipPanOnScrollWheelEvent({
  event,
  isMacOS,
  isPanScrolling,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: {
  event: WheelEvent;
  isMacOS: boolean;
  isPanScrolling: boolean;
  zoomActivationKeyPressed?: boolean;
  zoomOnPinch: boolean;
}): boolean {
  return (
    isWrappedWithClass(event, NO_WHEEL_CLASS_NAME) &&
    !zoomActivationKeyPressed &&
    !isPinchZoomWheelEvent({ event, zoomOnPinch, isMacOS }) &&
    !isPanScrolling
  );
}

function handlePinchZoomWheelEvent({
  currentZoom,
  d3Selection,
  event,
  interactionRefs,
  scaleTo,
  zoomOnPinch,
  isMacOS,
}: {
  currentZoom: number;
  d3Selection: D3Selection<Element, unknown, null, undefined>;
  event: WheelEvent;
  interactionRefs: ViewportInteractionCleanupRefs;
  scaleTo: ScaleToFn;
  zoomOnPinch: boolean;
  isMacOS: boolean;
}): boolean {
  if (!isPinchZoomWheelEvent({ event, zoomOnPinch, isMacOS })) {
    return false;
  }

  startWheelZoomBurst(interactionRefs);
  const point = pointer(event);
  const pinchDelta = wheelDelta(event, isMacOS);
  const zoom = currentZoom * Math.pow(2, pinchDelta);
  scaleTo(d3Selection, zoom, point, event);
  scheduleWheelZoomBurstEnd(interactionRefs);
  return true;
}

function createPanOnScrollWheelHandler({
  d3Selection,
  interactionRefs,
  panOnScrollMode,
  panOnScrollSpeed,
  scaleTo,
  translateBy,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: PanOnScrollWheelHandlerParams) {
  return (event: WheelEvent) => {
    const isMacOS = isMacOs();
    if (
      shouldSkipPanOnScrollWheelEvent({
        event,
        isMacOS,
        isPanScrolling: interactionRefs.isPanScrolling.current,
        zoomActivationKeyPressed,
        zoomOnPinch,
      })
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const currentZoom = d3Selection.property("__zoom").k || 1;
    if (
      handlePinchZoomWheelEvent({
        currentZoom,
        d3Selection,
        event,
        interactionRefs,
        scaleTo,
        zoomOnPinch,
        isMacOS,
      })
    ) {
      return;
    }

    const { deltaX, deltaY } = resolvePanOnScrollDelta({
      event,
      isMacOS,
      panOnScrollMode,
    });
    translateBy(
      d3Selection,
      -(deltaX / currentZoom) * panOnScrollSpeed,
      -(deltaY / currentZoom) * panOnScrollSpeed,
      { internal: true } as InternalWheelEvent,
    );
    ensurePanScrollInteraction(interactionRefs);
    schedulePanScrollInteractionEnd(interactionRefs);
  };
}

function shouldSkipDefaultWheelHandler({
  event,
  preventScrolling,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: {
  event: WheelEvent;
  preventScrolling: boolean;
  zoomActivationKeyPressed?: boolean;
  zoomOnPinch: boolean;
}): boolean {
  if (!preventScrolling) {
    return true;
  }
  if (!isWrappedWithClass(event, NO_WHEEL_CLASS_NAME)) {
    return false;
  }
  if (zoomActivationKeyPressed) {
    return false;
  }
  return !isPinchZoomWheelEvent({
    event,
    zoomOnPinch,
    isMacOS: getViewportEventMetadata(event).isMacOS,
  });
}

function createDefaultWheelHandler({
  d3Selection,
  d3Zoom,
  d3ZoomHandler,
  interactionRefs,
  preventScrolling,
  viewportTransformRefs,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: DefaultWheelHandlerParams) {
  return function defaultWheelHandler(
    this: Element,
    event: WheelEvent,
    data: unknown,
  ) {
    if (
      shouldSkipDefaultWheelHandler({
        event,
        preventScrolling,
        zoomActivationKeyPressed,
        zoomOnPinch,
      })
    ) {
      return;
    }

    event.preventDefault();
    const wasWheelZooming = interactionRefs.isWheelZooming.current;
    startWheelZoomBurst(interactionRefs);
    if (!wasWheelZooming) {
      closeAllContextMenus();
    }

    const { height, translateExtent, width } = useReactFlow.getState();
    const nextTransform = resolveDirectWheelViewportTransform({
      currentTransform: readCurrentViewportTransform(d3Selection),
      d3Zoom,
      event,
      target: this,
      translateExtent,
      viewportExtent: [
        [0, 0],
        [width, height],
      ],
    });

    if (nextTransform && d3Selection) {
      clearViewportTransformUpdate(viewportTransformRefs);
      syncSelectionViewportTransform(d3Selection, nextTransform);
      commitViewportTransform(nextTransform);
    } else if (d3ZoomHandler) {
      d3ZoomHandler.call(this, event, data);
    }

    scheduleWheelZoomBurstEnd(interactionRefs);
  };
}

function allowNodeMiddleClickPan({
  event,
  eventButton,
  panOnDrag,
}: {
  event: ZoomFilterEvent;
  eventButton: number;
  panOnDrag: boolean | number[];
}): boolean {
  const middleClickPanEnabled =
    panOnDrag === true || (Array.isArray(panOnDrag) && panOnDrag.includes(1));
  if (!middleClickPanEnabled) {
    return false;
  }
  if (eventButton !== 1 || event.type !== "mousedown") {
    return false;
  }
  return isWrappedWithClass(event, "react-flow__node");
}

function hasEnabledViewportInteraction({
  panOnDrag,
  panOnScroll,
  zoomOnDoubleClick,
  zoomOnPinch,
  zoomOnScroll,
}: {
  panOnDrag: boolean | number[];
  panOnScroll: boolean;
  zoomOnDoubleClick: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
}): boolean {
  return (
    Boolean(panOnDrag) ||
    zoomOnScroll ||
    panOnScroll ||
    zoomOnDoubleClick ||
    zoomOnPinch
  );
}

function blocksNoWheelTarget({
  event,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: {
  event: ZoomFilterEvent;
  zoomActivationKeyPressed?: boolean;
  zoomOnPinch: boolean;
}): boolean {
  if (!isWheelEventType(event.type)) {
    return false;
  }
  if (!isWrappedWithClass(event, NO_WHEEL_CLASS_NAME)) {
    return false;
  }
  if (zoomActivationKeyPressed) {
    return false;
  }
  return !isPinchZoomWheelEvent({
    event,
    zoomOnPinch,
    isMacOS: getViewportEventMetadata(event).isMacOS,
  });
}

function blocksNoPanTarget({
  event,
  panOnScroll,
  zoomActivationKeyPressed,
}: {
  event: ZoomFilterEvent;
  panOnScroll: boolean;
  zoomActivationKeyPressed?: boolean;
}): boolean {
  if (!isWrappedWithClass(event, NO_PAN_CLASS_NAME)) {
    return false;
  }
  if (!isWheelEventType(event.type)) {
    return true;
  }
  return panOnScroll && !zoomActivationKeyPressed;
}

function blocksPointerStartWithoutPan({
  event,
  eventButton,
  panOnDrag,
}: {
  event: ZoomFilterEvent;
  eventButton: number;
  panOnDrag: boolean | number[];
}): boolean {
  if (!isPointerStartEvent(event.type)) {
    return false;
  }
  if (!panOnDrag) {
    return true;
  }
  return Array.isArray(panOnDrag) && !panOnDrag.includes(eventButton);
}

function shouldBlockZoomFilterByInteractionState({
  event,
  eventButton,
  panOnDrag,
  panOnScroll,
  userSelectionActive,
  zoomOnDoubleClick,
  zoomOnPinch,
  zoomOnScroll,
}: {
  event: ZoomFilterEvent;
  eventButton: number;
  panOnDrag: boolean | number[];
  panOnScroll: boolean;
  userSelectionActive: boolean;
  zoomOnDoubleClick: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
}): boolean {
  if (
    !hasEnabledViewportInteraction({
      panOnDrag,
      panOnScroll,
      zoomOnDoubleClick,
      zoomOnPinch,
      zoomOnScroll,
    })
  ) {
    return true;
  }
  if (userSelectionActive) {
    return true;
  }
  if (!zoomOnDoubleClick && event.type === "dblclick") {
    return true;
  }
  if (blocksPointerStartWithoutPan({ event, eventButton, panOnDrag })) {
    return true;
  }

  const { isSorting, isMovingFree } = useDndState.getState();
  return isSorting || isMovingFree;
}

function shouldBlockZoomFilterByTarget({
  event,
  panOnScroll,
  zoomActivationKeyPressed,
  zoomOnPinch,
  zoomOnScroll,
}: {
  event: ZoomFilterEvent;
  panOnScroll: boolean;
  zoomActivationKeyPressed?: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
}): boolean {
  const pinchZoom = zoomOnPinch && event.ctrlKey;
  return (
    blocksNoWheelTarget({ event, zoomActivationKeyPressed, zoomOnPinch }) ||
    blocksNoPanTarget({ event, panOnScroll, zoomActivationKeyPressed }) ||
    shouldBlockCtrlWheelWithoutPinch({ event, zoomOnPinch }) ||
    shouldBlockWheelViewportGesture({
      event,
      panOnScroll,
      pinchZoom,
      zoomOnScroll,
    })
  );
}

function shouldBlockCtrlWheelWithoutPinch({
  event,
  zoomOnPinch,
}: {
  event: ZoomFilterEvent;
  zoomOnPinch: boolean;
}): boolean {
  if (!isWheelEventType(event.type)) {
    return false;
  }
  if (!event.ctrlKey) {
    return false;
  }
  return !zoomOnPinch;
}

function shouldBlockWheelViewportGesture({
  event,
  panOnScroll,
  pinchZoom,
  zoomOnScroll,
}: {
  event: ZoomFilterEvent;
  panOnScroll: boolean;
  pinchZoom: boolean;
  zoomOnScroll: boolean;
}): boolean {
  if (!isWheelEventType(event.type)) {
    return false;
  }
  if (zoomOnScroll || panOnScroll) {
    return false;
  }
  return !pinchZoom;
}

function isAllowedViewportButton({
  eventButton,
  panOnDrag,
}: {
  eventButton: number;
  panOnDrag: boolean | number[];
}): boolean {
  if (Array.isArray(panOnDrag) && panOnDrag.includes(eventButton)) {
    return true;
  }
  return eventButton <= 1;
}

export function shouldAllowZoomFilterEvent({
  event,
  panOnDrag,
  panOnScroll,
  userSelectionActive,
  zoomActivationKeyPressed,
  zoomOnDoubleClick,
  zoomOnPinch,
  zoomOnScroll,
}: ZoomFilterParams): boolean {
  const zoomScroll = Boolean(zoomActivationKeyPressed) || zoomOnScroll;
  const eventButton = getEventButton(event);
  if (allowNodeMiddleClickPan({ event, eventButton, panOnDrag })) {
    return true;
  }
  if (
    shouldBlockZoomFilterByInteractionState({
      event,
      eventButton,
      panOnDrag,
      panOnScroll,
      userSelectionActive,
      zoomOnDoubleClick,
      zoomOnPinch,
      zoomOnScroll: zoomScroll,
    })
  ) {
    return false;
  }
  if (
    shouldBlockZoomFilterByTarget({
      event,
      panOnScroll,
      zoomActivationKeyPressed,
      zoomOnPinch,
      zoomOnScroll: zoomScroll,
    })
  ) {
    return false;
  }
  return (
    (!event.ctrlKey || isWheelEventType(event.type)) &&
    isAllowedViewportButton({ eventButton, panOnDrag })
  );
}

function useViewportInteractionCleanup({
  isPanScrolling,
  isWheelZooming,
  isZoomingOrPanning,
  panScrollTimeout,
  wheelZoomTimeout,
}: ViewportInteractionCleanupRefs) {
  useEffect(() => {
    return () => {
      resetViewportInteractionState({
        isPanScrolling,
        isWheelZooming,
        isZoomingOrPanning,
        panScrollTimeout,
        wheelZoomTimeout,
      });
    };
  }, [
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    panScrollTimeout,
    wheelZoomTimeout,
  ]);
}

function useViewportTransformCleanup(
  viewportTransformRefs: QueuedViewportTransformUpdateRefs,
) {
  useEffect(() => {
    return () => {
      clearViewportTransformUpdate(viewportTransformRefs);
    };
  }, [viewportTransformRefs]);
}

function useZoomWheelBehavior({
  d3Selection,
  d3Zoom,
  d3ZoomHandler,
  interactionRefs,
  panOnScroll,
  panOnScrollMode,
  panOnScrollSpeed,
  preventScrolling,
  userSelectionActive,
  viewportTransformRefs,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: {
  d3Selection: ReactFlowState["d3Selection"];
  d3Zoom: ReactFlowState["d3Zoom"];
  d3ZoomHandler: ReactFlowState["d3ZoomHandler"];
  interactionRefs: ViewportInteractionCleanupRefs;
  panOnScroll: boolean;
  panOnScrollMode: PanOnScrollModeEnum;
  panOnScrollSpeed: number;
  preventScrolling: boolean;
  userSelectionActive: boolean;
  viewportTransformRefs: QueuedViewportTransformUpdateRefs;
  zoomActivationKeyPressed?: boolean;
  zoomOnPinch: boolean;
}) {
  const {
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    panScrollTimeout,
    wheelZoomTimeout,
  } = interactionRefs;

  useEffect(() => {
    if (!d3Selection || !d3Zoom) {
      return;
    }

    const wheelInteractionRefs: ViewportInteractionCleanupRefs = {
      isPanScrolling,
      isWheelZooming,
      isZoomingOrPanning,
      panScrollTimeout,
      wheelZoomTimeout,
    };
    const scaleTo = d3Zoom.scaleTo as unknown as ScaleToFn;
    const translateBy = d3Zoom.translateBy as unknown as TranslateByFn;

    if (panOnScroll && !zoomActivationKeyPressed && !userSelectionActive) {
      d3Selection.on(
        "wheel.zoom",
        createPanOnScrollWheelHandler({
          d3Selection,
          interactionRefs: wheelInteractionRefs,
          panOnScrollMode,
          panOnScrollSpeed,
          scaleTo,
          translateBy,
          zoomActivationKeyPressed,
          zoomOnPinch,
        }),
        { passive: false },
      );
      return;
    }

    if (typeof d3ZoomHandler === "undefined") {
      return;
    }

    d3Selection.on(
      "wheel.zoom",
      createDefaultWheelHandler({
        d3Selection,
        d3Zoom,
        d3ZoomHandler,
        interactionRefs: wheelInteractionRefs,
        preventScrolling,
        viewportTransformRefs,
        zoomActivationKeyPressed,
        zoomOnPinch,
      }),
      { passive: false },
    );
  }, [
    d3Selection,
    d3Zoom,
    d3ZoomHandler,
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    panScrollTimeout,
    wheelZoomTimeout,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    preventScrolling,
    userSelectionActive,
    viewportTransformRefs,
    zoomActivationKeyPressed,
    zoomOnPinch,
  ]);
}

function useZoomLifecycleHandlers({
  d3Zoom,
  isPanScrolling,
  isWheelZooming,
  isZoomingOrPanning,
  userSelectionActive,
  viewportTransformRefs,
}: {
  d3Zoom: ReactFlowState["d3Zoom"];
  isPanScrolling: ViewportInteractionRefs["isPanScrolling"];
  isWheelZooming: ViewportInteractionRefs["isWheelZooming"];
  isZoomingOrPanning: ViewportInteractionRefs["isZoomingOrPanning"];
  userSelectionActive: boolean;
  viewportTransformRefs: QueuedViewportTransformUpdateRefs;
}) {
  useEffect(() => {
    if (!d3Zoom) {
      return;
    }

    d3Zoom.on("start", (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
      const sourceEvent = event.sourceEvent as ZoomSourceEvent | null;
      if (!sourceEvent || sourceEvent.internal) {
        return;
      }
      isZoomingOrPanning.current = true;
      syncViewportInteractionActive({
        isPanScrolling,
        isWheelZooming,
        isZoomingOrPanning,
      });

      if (sourceEvent.type === "mousedown") {
        useReactFlow.setState({ paneDragging: true });
      }

      closeAllContextMenus();
    });
  }, [d3Zoom, isPanScrolling, isWheelZooming, isZoomingOrPanning]);

  useEffect(() => {
    if (!d3Zoom) {
      return;
    }
    if (userSelectionActive && !isZoomingOrPanning.current) {
      d3Zoom.on("zoom", null);
      return;
    }
    if (userSelectionActive) {
      return;
    }

    d3Zoom.on("zoom", (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
      if (useAIFollow.getState().isFollowTransitioning && event.sourceEvent) {
        return;
      }
      const nextTransform: ViewportTransform = [
        event.transform.x,
        event.transform.y,
        event.transform.k,
      ];
      const sourceEvent = event.sourceEvent as ZoomSourceEvent | null;

      if (shouldQueueViewportTransformEvent(sourceEvent)) {
        queueViewportTransformUpdate(viewportTransformRefs, nextTransform);
        return;
      }

      flushViewportTransformUpdate(viewportTransformRefs, nextTransform);
    });
  }, [d3Zoom, isZoomingOrPanning, userSelectionActive, viewportTransformRefs]);

  useEffect(() => {
    if (!d3Zoom) {
      return;
    }

    d3Zoom.on("end", (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
      flushViewportTransformUpdate(viewportTransformRefs, [
        event.transform.x,
        event.transform.y,
        event.transform.k,
      ]);

      const sourceEvent = event.sourceEvent as ZoomSourceEvent | null;
      if (!sourceEvent || sourceEvent.internal) {
        return;
      }
      isZoomingOrPanning.current = false;
      syncViewportInteractionActive({
        isPanScrolling,
        isWheelZooming,
        isZoomingOrPanning,
      });
      useReactFlow.setState({ paneDragging: false });
      if (sourceEvent.type === "wheel") {
        return;
      }
      syncViewportInteractionActive({
        isPanScrolling,
        isWheelZooming,
        isZoomingOrPanning,
      });
    });
  }, [
    d3Zoom,
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    viewportTransformRefs,
  ]);
}

function useZoomFilterBinding({
  d3Zoom,
  panOnDrag,
  panOnScroll,
  userSelectionActive,
  zoomActivationKeyPressed,
  zoomOnDoubleClick,
  zoomOnPinch,
  zoomOnScroll,
}: {
  d3Zoom: ReactFlowState["d3Zoom"];
  panOnDrag: boolean | number[];
  panOnScroll: boolean;
  userSelectionActive: boolean;
  zoomActivationKeyPressed?: boolean;
  zoomOnDoubleClick: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
}) {
  useEffect(() => {
    if (!d3Zoom) {
      return;
    }
    d3Zoom.filter((event: ZoomFilterEvent) =>
      shouldAllowZoomFilterEvent({
        event,
        panOnDrag,
        panOnScroll,
        userSelectionActive,
        zoomActivationKeyPressed,
        zoomOnDoubleClick,
        zoomOnPinch,
        zoomOnScroll,
      }),
    );
  }, [
    d3Zoom,
    panOnDrag,
    panOnScroll,
    userSelectionActive,
    zoomActivationKeyPressed,
    zoomOnDoubleClick,
    zoomOnPinch,
    zoomOnScroll,
  ]);
}

function useFitViewInitialization({
  d3Selection,
  d3Zoom,
  fitViewOnInit,
  fitViewOnInitDone,
  fitViewOnInitOptions,
}: {
  d3Selection: ReactFlowState["d3Selection"];
  d3Zoom: ReactFlowState["d3Zoom"];
  fitViewOnInit: boolean;
  fitViewOnInitDone: boolean;
  fitViewOnInitOptions: ReactFlowState["fitViewOnInitOptions"];
}) {
  useEffect(() => {
    if (!d3Zoom || !d3Selection || !fitViewOnInit || fitViewOnInitDone) {
      return;
    }
    const didCompleteInitialFit = fitView({
      initial: true,
      ...fitViewOnInitOptions,
    });
    if (didCompleteInitialFit) {
      useReactFlow.setState({
        fitViewOnInit: false,
        fitViewOnInitDone: true,
      });
    }
  }, [
    d3Selection,
    d3Zoom,
    fitViewOnInit,
    fitViewOnInitDone,
    fitViewOnInitOptions,
  ]);
}

function resolveZoomPaneProps(props: ZoomPaneProps): ZoomPaneProps {
  return { ...defaultZoomPaneProps, ...props };
}

const ZoomPane = (props: ZoomPaneProps) => {
  const {
    zoomOnScroll,
    zoomOnPinch,
    panOnScroll,
    panOnScrollSpeed,
    panOnScrollMode,
    zoomOnDoubleClick,
    panOnDrag,
    zoomActivationKeyPressed,
    translateExtent,
    preventScrolling,
    children,
    wrapperDimensions,
  } = resolveZoomPaneProps(props);
  const isZoomingOrPanning = useRef(false);
  const zoomPane = useRef<HTMLDivElement>(null);
  const {
    d3Zoom,
    d3Selection,
    d3ZoomHandler,
    userSelectionActive,
    fitViewOnInit,
    fitViewOnInitDone,
    fitViewOnInitOptions,
  } = useReactFlow(selector, shallow);
  const isPanScrolling = useRef(false);
  const isWheelZooming = useRef(false);
  const panScrollTimeout = useRef<ReturnType<typeof setTimeout>>();
  const wheelZoomTimeout = useRef<ReturnType<typeof setTimeout>>();
  const viewportTransformFrame = useRef<ViewportTransformFrameHandle | null>(
    null,
  );
  const pendingViewportTransform = useRef<ViewportTransform | null>(null);
  const interactionRefs: ViewportInteractionCleanupRefs = {
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    panScrollTimeout,
    wheelZoomTimeout,
  };
  const viewportTransformRefs = useMemo<QueuedViewportTransformUpdateRefs>(
    () => ({
      frameId: viewportTransformFrame,
      pendingTransform: pendingViewportTransform,
    }),
    [],
  );
  useZoomPaneInit(zoomPane, translateExtent);
  useViewportInteractionCleanup(interactionRefs);
  useViewportTransformCleanup(viewportTransformRefs);
  useZoomWheelBehavior({
    d3Selection,
    d3Zoom,
    d3ZoomHandler,
    interactionRefs,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    preventScrolling,
    userSelectionActive,
    viewportTransformRefs,
    zoomActivationKeyPressed,
    zoomOnPinch,
  });
  useZoomLifecycleHandlers({
    d3Zoom,
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    userSelectionActive,
    viewportTransformRefs,
  });
  useZoomFilterBinding({
    d3Zoom,
    panOnDrag,
    panOnScroll,
    userSelectionActive,
    zoomActivationKeyPressed,
    zoomOnDoubleClick,
    zoomOnPinch,
    zoomOnScroll,
  });
  useFitViewInitialization({
    d3Selection,
    d3Zoom,
    fitViewOnInit,
    fitViewOnInitDone,
    fitViewOnInitOptions,
  });

  return (
    <div
      className="react-flow__renderer"
      ref={zoomPane}
      style={{
        width: wrapperDimensions.width,
        height: wrapperDimensions.height,
        position: "absolute",
        top: 0,
        left: 0,
      }}
    >
      {children}
    </div>
  );
};

export default ZoomPane;

function useZoomPaneInit(
  zoomPane: RefObject<HTMLDivElement>,
  translateExtent: CoordinateExtent,
) {
  useEffect(() => {
    zoomPaneInit({ zoomPane, translateExtent, initialViewport: getViewport() });
  }, []);
}

function zoomPaneInit({
  zoomPane,
  translateExtent,
  initialViewport,
}: ZoomPaneInitParams) {
  if (zoomPane.current) {
    const bbox = zoomPane.current.getBoundingClientRect();
    const { minZoom, maxZoom } = useSettings.getState().gui;
    // .interpolate(interpolate) makes the interpolations linear instead of curved
    const d3ZoomInstance = zoom()
      .interpolate(interpolate)
      .scaleExtent([minZoom, maxZoom])
      .translateExtent(translateExtent);
    const selection = select(zoomPane.current as Element).call(d3ZoomInstance);
    const updatedTransform = zoomIdentity
      .translate(initialViewport.x, initialViewport.y)
      .scale(clamp(initialViewport.zoom, minZoom, maxZoom));
    const extent: CoordinateExtent = [
      [0, 0],
      [bbox.width, bbox.height],
    ];

    const constrainedTransform = d3ZoomInstance.constrain()(
      updatedTransform,
      extent,
      translateExtent,
    );
    d3ZoomInstance.transform(selection, constrainedTransform);
    d3ZoomInstance.wheelDelta(wheelDelta);

    const d3ZoomHandler = selection.on(
      "wheel.zoom",
    ) as ReactFlowState["d3ZoomHandler"];

    useReactFlow.setState({
      d3Zoom: d3ZoomInstance,
      d3Selection: selection,
      d3ZoomHandler,
      // we need to pass transform because zoom handler is not registered when we set the initial transform
      transform: [
        constrainedTransform.x,
        constrainedTransform.y,
        constrainedTransform.k,
      ],
      domNode: zoomPane.current.closest(".react-flow") as HTMLDivElement,
    });
  }
}
