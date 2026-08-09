import { interpolate } from "d3-interpolate";
import { pointer, select, type Selection as D3Selection } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { shallow } from "zustand/shallow";
import { useDndState } from "../dnd/dndState";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "../interaction";
import { getInitialCanvasViewport } from "./documentViewportSync";
import { fitView } from "./fitView";
import { useWorkspaceOptions } from "./options";
import { infiniteExtent, useReactFlow } from "./store";
import type { CoordinateExtent, PanOnScrollMode, ReactFlowState } from "./types";
import { clamp, getWheelDelta, isMacOs } from "./utils";

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
  zoomOnScroll: boolean;
  zoomOnPinch: boolean;
  panOnScroll: boolean;
  panOnScrollSpeed: number;
  panOnScrollMode: PanOnScrollMode;
  zoomOnDoubleClick: boolean;
  panOnDrag: boolean | Array<number>;
  zoomActivationKeyPressed: boolean;
  children: ReactNode;
  wrapperDimensions: { width: number; height: number };
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
  panOnScrollMode: PanOnScrollMode;
  panOnScrollSpeed: number;
  scaleTo: ScaleToFn;
  translateBy: TranslateByFn;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
};

type DefaultWheelHandlerParams = {
  d3ZoomHandler: NonNullable<ReactFlowState["d3ZoomHandler"]>;
  interactionRefs: ViewportInteractionCleanupRefs;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
};

type ZoomFilterParams = {
  event: ZoomFilterEvent;
  panOnDrag: boolean | Array<number>;
  panOnScroll: boolean;
  userSelectionActive: boolean;
  zoomActivationKeyPressed?: boolean;
  zoomOnDoubleClick: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
};

const isWrappedWithClass = (event: Event, className?: string): boolean => {
  if (!className) {
    return false;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(`.${className}`) !== null;
};

const getEventButton = (event: ZoomFilterEvent): number => ("button" in event ? event.button : 0);

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
  useReactFlow.setState({
    paneDragging: false,
    viewportInteractionActive: false,
  });
}

const wheelDelta = (event: WheelEvent) => {
  const factor = event.ctrlKey && isMacOs() ? 10 : 1;

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

function scheduleWheelZoomBurstEnd(interactionRefs: ViewportInteractionCleanupRefs) {
  interactionRefs.wheelZoomTimeout.current = setTimeout(() => {
    interactionRefs.isWheelZooming.current = false;
    syncViewportInteractionActive(interactionRefs);
  }, 180);
}

function ensurePanScrollInteraction(interactionRefs: ViewportInteractionCleanupRefs) {
  if (interactionRefs.isPanScrolling.current) {
    return;
  }
  interactionRefs.isPanScrolling.current = true;
  syncViewportInteractionActive(interactionRefs);
}

function schedulePanScrollInteractionEnd(interactionRefs: ViewportInteractionCleanupRefs) {
  clearTimeout(interactionRefs.panScrollTimeout.current);
  interactionRefs.panScrollTimeout.current = setTimeout(() => {
    interactionRefs.isPanScrolling.current = false;
    syncViewportInteractionActive(interactionRefs);
  }, 150);
}

function isPinchZoomWheelEvent({ event, zoomOnPinch, isMacOS }: PinchZoomCheck): boolean {
  return event.ctrlKey && zoomOnPinch && isMacOS;
}

export function resolvePanOnScrollDelta({
  event,
  isMacOS,
  panOnScrollMode,
}: {
  event: WheelEvent;
  isMacOS: boolean;
  panOnScrollMode: PanOnScrollMode;
}): PanOnScrollDelta {
  const deltaNormalize = event.deltaMode === 1 ? 20 : 1;
  let deltaX = panOnScrollMode === "vertical" ? 0 : event.deltaX * deltaNormalize;
  let deltaY = panOnScrollMode === "horizontal" ? 0 : event.deltaY * deltaNormalize;

  if (!isMacOS && event.shiftKey && panOnScrollMode !== "vertical") {
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
  zoomActivationKeyPressed: boolean;
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
  const pinchDelta = wheelDelta(event);
  const nextZoom = currentZoom * Math.pow(2, pinchDelta);
  scaleTo(d3Selection, nextZoom, point, event);
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
  zoomActivationKeyPressed,
  zoomOnPinch,
}: {
  event: WheelEvent;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
}): boolean {
  if (!isWrappedWithClass(event, NO_WHEEL_CLASS_NAME)) {
    return false;
  }
  if (zoomActivationKeyPressed) {
    return false;
  }
  return !isPinchZoomWheelEvent({
    event,
    zoomOnPinch,
    isMacOS: isMacOs(),
  });
}

function createDefaultWheelHandler({
  d3ZoomHandler,
  interactionRefs,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: DefaultWheelHandlerParams) {
  return function defaultWheelHandler(this: Element, event: WheelEvent, data: unknown) {
    if (
      shouldSkipDefaultWheelHandler({
        event,
        zoomActivationKeyPressed,
        zoomOnPinch,
      })
    ) {
      return;
    }

    event.preventDefault();
    startWheelZoomBurst(interactionRefs);
    d3ZoomHandler.call(this, event, data);
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
  panOnDrag: boolean | Array<number>;
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
  panOnDrag: boolean | Array<number>;
  panOnScroll: boolean;
  zoomOnDoubleClick: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
}): boolean {
  return Boolean(panOnDrag) || zoomOnScroll || panOnScroll || zoomOnDoubleClick || zoomOnPinch;
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
    isMacOS: isMacOs(),
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
  panOnDrag: boolean | Array<number>;
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
  panOnDrag: boolean | Array<number>;
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

  // The zoom pane suspends panning while a dnd mode is held; the two interaction engines
  // coexist by giving the held mode's gesture one owner.
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
  panOnDrag: boolean | Array<number>;
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
  }, [isPanScrolling, isWheelZooming, isZoomingOrPanning, panScrollTimeout, wheelZoomTimeout]);
}

function useZoomWheelBehavior({
  d3Selection,
  d3Zoom,
  d3ZoomHandler,
  interactionRefs,
  panOnScroll,
  panOnScrollMode,
  panOnScrollSpeed,
  userSelectionActive,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: {
  d3Selection: ReactFlowState["d3Selection"];
  d3Zoom: ReactFlowState["d3Zoom"];
  d3ZoomHandler: ReactFlowState["d3ZoomHandler"];
  interactionRefs: ViewportInteractionCleanupRefs;
  panOnScroll: boolean;
  panOnScrollMode: PanOnScrollMode;
  panOnScrollSpeed: number;
  userSelectionActive: boolean;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
}) {
  const { isPanScrolling, isWheelZooming, isZoomingOrPanning, panScrollTimeout, wheelZoomTimeout } =
    interactionRefs;

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
        d3ZoomHandler,
        interactionRefs: wheelInteractionRefs,
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
    userSelectionActive,
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
}: {
  d3Zoom: ReactFlowState["d3Zoom"];
  isPanScrolling: ViewportInteractionRefs["isPanScrolling"];
  isWheelZooming: ViewportInteractionRefs["isWheelZooming"];
  isZoomingOrPanning: ViewportInteractionRefs["isZoomingOrPanning"];
  userSelectionActive: boolean;
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
      useReactFlow.setState({
        transform: [event.transform.x, event.transform.y, event.transform.k],
      });
    });
  }, [d3Zoom, isZoomingOrPanning, userSelectionActive]);

  useEffect(() => {
    if (!d3Zoom) {
      return;
    }

    d3Zoom.on("end", (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
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
    });
  }, [d3Zoom, isPanScrolling, isWheelZooming, isZoomingOrPanning]);
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
  panOnDrag: boolean | Array<number>;
  panOnScroll: boolean;
  userSelectionActive: boolean;
  zoomActivationKeyPressed: boolean;
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
  }, [d3Selection, d3Zoom, fitViewOnInit, fitViewOnInitDone, fitViewOnInitOptions]);
}

const ZoomPane = ({
  zoomOnScroll,
  zoomOnPinch,
  panOnScroll,
  panOnScrollSpeed,
  panOnScrollMode,
  zoomOnDoubleClick,
  panOnDrag,
  zoomActivationKeyPressed,
  children,
  wrapperDimensions,
}: ZoomPaneProps) => {
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
  const panScrollTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wheelZoomTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const interactionRefs: ViewportInteractionCleanupRefs = {
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    panScrollTimeout,
    wheelZoomTimeout,
  };
  useZoomPaneInit(zoomPane);
  useViewportInteractionCleanup(interactionRefs);
  useZoomWheelBehavior({
    d3Selection,
    d3Zoom,
    d3ZoomHandler,
    interactionRefs,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    userSelectionActive,
    zoomActivationKeyPressed,
    zoomOnPinch,
  });
  useZoomLifecycleHandlers({
    d3Zoom,
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    userSelectionActive,
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

function useZoomPaneInit(zoomPane: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    zoomPaneInit(zoomPane);
    // The reference swaps whole keyed project surfaces, so it never observes a canvas store that
    // outlives its zoom pane. The package canvas store does outlive an unmounted canvas, and the
    // load orchestrator treats live d3 handles as "canvas mounted" — so an unmount must clear
    // them. Only the handles: the fit flags feed the still-subscribed viewport sync (parent
    // effects clean up after children), and the next mount's `getInitialCanvasViewport` resets
    // them from the document either way.
    return () => {
      useReactFlow.setState({
        d3Zoom: null,
        d3Selection: null,
        d3ZoomHandler: undefined,
        domNode: null,
      });
    };
  }, [zoomPane]);
}

function zoomPaneInit(zoomPane: RefObject<HTMLDivElement | null>) {
  if (zoomPane.current) {
    const initialViewport = getInitialCanvasViewport();
    const translateExtent = infiniteExtent;
    const bbox = zoomPane.current.getBoundingClientRect();
    const { minZoom, maxZoom } = useWorkspaceOptions.getState();
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

    const d3ZoomHandler = selection.on("wheel.zoom") as ReactFlowState["d3ZoomHandler"];

    useReactFlow.setState({
      d3Zoom: d3ZoomInstance,
      d3Selection: selection,
      d3ZoomHandler,
      // we need to pass transform because zoom handler is not registered when we set the initial transform
      transform: [constrainedTransform.x, constrainedTransform.y, constrainedTransform.k],
      domNode: zoomPane.current.closest(".react-flow") as HTMLDivElement,
    });
  }
}
