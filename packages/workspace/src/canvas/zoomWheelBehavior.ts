import { pointer, type Selection as D3Selection } from "d3-selection";
import { useEffect } from "react";
import {
  MANUAL_WHEEL_CLASS_NAME,
  NATIVE_VERTICAL_WHEEL_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "../interaction";
import type { WorkspaceHost } from "../workspaceHost";
import { getReactFlowStore } from "./store";
import type { PanOnScrollMode, ReactFlowState } from "./types";
import { getWheelDelta, isMacOs } from "./utils";

type InternalWheelEvent = WheelEvent & { internal?: boolean };
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

export type ViewportInteractionRefs = {
  host: WorkspaceHost;
  isPanScrolling: { current: boolean };
  isWheelZooming: { current: boolean };
  isZoomingOrPanning: { current: boolean };
};

export type ViewportInteractionCleanupRefs = ViewportInteractionRefs & {
  panScrollTimeout: { current: ReturnType<typeof setTimeout> | undefined };
  wheelZoomTimeout: { current: ReturnType<typeof setTimeout> | undefined };
};

type PanOnScrollDelta = {
  deltaX: number;
  deltaY: number;
};

type WheelTargetDisposition = "canvas" | "manual" | "native";

type PanOnScrollWheelHandlerParams = {
  d3Selection: D3Selection<Element, unknown, null, undefined>;
  interactionRefs: ViewportInteractionCleanupRefs;
  panOnScrollMode: PanOnScrollMode;
  panOnScrollSpeed: number;
  scaleTo: ScaleToFn;
  syncViewportInteractionActive: (
    interactionRefs: ViewportInteractionRefs,
  ) => void;
  translateBy: TranslateByFn;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
};

type DefaultWheelHandlerParams = {
  d3ZoomHandler: NonNullable<ReactFlowState["d3ZoomHandler"]>;
  interactionRefs: ViewportInteractionCleanupRefs;
  syncViewportInteractionActive: (
    interactionRefs: ViewportInteractionRefs,
  ) => void;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
};

export const wheelDelta = (event: WheelEvent) => {
  const factor = event.ctrlKey && isMacOs() ? 10 : 1;

  return getWheelDelta(event, factor);
};

export const isWrappedWithClass = (
  event: Event,
  className?: string,
): boolean => {
  if (!className) {
    return false;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(`.${className}`) !== null;
};

export function isPinchZoomWheelEvent({
  event,
  zoomOnPinch,
  isMacOS,
}: {
  event: Pick<WheelEvent, "ctrlKey">;
  zoomOnPinch: boolean;
  isMacOS: boolean;
}): boolean {
  return event.ctrlKey && zoomOnPinch && isMacOS;
}

export function isNativeVerticalWheelEvent(
  event: WheelEvent,
  isMacOS: boolean,
): boolean {
  return (
    isWrappedWithClass(event, NATIVE_VERTICAL_WHEEL_CLASS_NAME) &&
    (isMacOS || !event.shiftKey) &&
    Math.abs(event.deltaY) >= Math.abs(event.deltaX)
  );
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
  let deltaX =
    panOnScrollMode === "vertical" ? 0 : event.deltaX * deltaNormalize;
  let deltaY =
    panOnScrollMode === "horizontal" ? 0 : event.deltaY * deltaNormalize;

  if (!isMacOS && event.shiftKey && panOnScrollMode !== "vertical") {
    deltaX = event.deltaY * deltaNormalize;
    deltaY = 0;
  }

  return { deltaX, deltaY };
}

function resolveWheelTargetDisposition({
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
}): WheelTargetDisposition {
  if (
    zoomActivationKeyPressed ||
    isPinchZoomWheelEvent({ event, zoomOnPinch, isMacOS })
  ) {
    return "canvas";
  }
  if (isWrappedWithClass(event, MANUAL_WHEEL_CLASS_NAME)) {
    return "manual";
  }
  if (isPanScrolling) {
    return "canvas";
  }
  return isWrappedWithClass(event, NO_WHEEL_CLASS_NAME) ||
    isNativeVerticalWheelEvent(event, isMacOS)
    ? "native"
    : "canvas";
}

function startWheelZoomBurst({
  interactionRefs,
  syncViewportInteractionActive,
}: Pick<
  DefaultWheelHandlerParams,
  "interactionRefs" | "syncViewportInteractionActive"
>): void {
  clearTimeout(interactionRefs.wheelZoomTimeout.current);
  if (interactionRefs.isWheelZooming.current) {
    return;
  }
  interactionRefs.isWheelZooming.current = true;
  syncViewportInteractionActive(interactionRefs);
}

function scheduleWheelZoomBurstEnd({
  interactionRefs,
  syncViewportInteractionActive,
}: Pick<
  DefaultWheelHandlerParams,
  "interactionRefs" | "syncViewportInteractionActive"
>): void {
  interactionRefs.wheelZoomTimeout.current = setTimeout(() => {
    interactionRefs.isWheelZooming.current = false;
    syncViewportInteractionActive(interactionRefs);
  }, 180);
}

function ensurePanScrollInteraction({
  interactionRefs,
  syncViewportInteractionActive,
}: Pick<
  PanOnScrollWheelHandlerParams,
  "interactionRefs" | "syncViewportInteractionActive"
>): void {
  if (interactionRefs.isPanScrolling.current) {
    return;
  }
  getReactFlowStore(interactionRefs.host).setState({ isPanScrolling: true });
  interactionRefs.isPanScrolling.current = true;
  syncViewportInteractionActive(interactionRefs);
}

function schedulePanScrollInteractionEnd({
  interactionRefs,
  syncViewportInteractionActive,
}: Pick<
  PanOnScrollWheelHandlerParams,
  "interactionRefs" | "syncViewportInteractionActive"
>): void {
  clearTimeout(interactionRefs.panScrollTimeout.current);
  interactionRefs.panScrollTimeout.current = setTimeout(() => {
    interactionRefs.isPanScrolling.current = false;
    getReactFlowStore(interactionRefs.host).setState({
      isPanScrolling: false,
    });
    syncViewportInteractionActive(interactionRefs);
  }, 150);
}

function handlePinchZoomWheelEvent({
  currentZoom,
  d3Selection,
  event,
  interactionRefs,
  scaleTo,
  syncViewportInteractionActive,
  zoomOnPinch,
  isMacOS,
}: {
  currentZoom: number;
  d3Selection: D3Selection<Element, unknown, null, undefined>;
  event: WheelEvent;
  interactionRefs: ViewportInteractionCleanupRefs;
  scaleTo: ScaleToFn;
  syncViewportInteractionActive: (
    interactionRefs: ViewportInteractionRefs,
  ) => void;
  zoomOnPinch: boolean;
  isMacOS: boolean;
}): boolean {
  if (!isPinchZoomWheelEvent({ event, zoomOnPinch, isMacOS })) {
    return false;
  }

  startWheelZoomBurst({ interactionRefs, syncViewportInteractionActive });
  const point = pointer(event);
  const pinchDelta = wheelDelta(event);
  const nextZoom = currentZoom * Math.pow(2, pinchDelta);
  scaleTo(d3Selection, nextZoom, point, event);
  scheduleWheelZoomBurstEnd({ interactionRefs, syncViewportInteractionActive });
  return true;
}

function createPanOnScrollWheelHandler({
  d3Selection,
  interactionRefs,
  panOnScrollMode,
  panOnScrollSpeed,
  scaleTo,
  syncViewportInteractionActive,
  translateBy,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: PanOnScrollWheelHandlerParams) {
  return (event: WheelEvent) => {
    const isMacOS = isMacOs();
    const targetDisposition = resolveWheelTargetDisposition({
      event,
      isMacOS,
      isPanScrolling: interactionRefs.isPanScrolling.current,
      zoomActivationKeyPressed,
      zoomOnPinch,
    });
    if (targetDisposition !== "canvas") {
      if (targetDisposition === "manual") {
        event.preventDefault();
      }
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
        syncViewportInteractionActive,
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
    ensurePanScrollInteraction({
      interactionRefs,
      syncViewportInteractionActive,
    });
    schedulePanScrollInteractionEnd({
      interactionRefs,
      syncViewportInteractionActive,
    });
  };
}

function createDefaultWheelHandler({
  d3ZoomHandler,
  interactionRefs,
  syncViewportInteractionActive,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: DefaultWheelHandlerParams) {
  return function defaultWheelHandler(
    this: Element,
    event: WheelEvent,
    data: unknown,
  ) {
    const targetDisposition = resolveWheelTargetDisposition({
      event,
      isMacOS: isMacOs(),
      isPanScrolling: false,
      zoomActivationKeyPressed,
      zoomOnPinch,
    });
    if (targetDisposition !== "canvas") {
      if (targetDisposition === "manual") {
        event.preventDefault();
      }
      return;
    }

    event.preventDefault();
    startWheelZoomBurst({ interactionRefs, syncViewportInteractionActive });
    d3ZoomHandler.call(this, event, data);
    scheduleWheelZoomBurstEnd({
      interactionRefs,
      syncViewportInteractionActive,
    });
  };
}

export function useZoomWheelBehavior({
  d3Selection,
  d3Zoom,
  d3ZoomHandler,
  interactionRefs,
  panOnScroll,
  panOnScrollMode,
  panOnScrollSpeed,
  syncViewportInteractionActive,
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
  syncViewportInteractionActive: (
    interactionRefs: ViewportInteractionRefs,
  ) => void;
  userSelectionActive: boolean;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
}) {
  const {
    host,
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
      host,
      isPanScrolling,
      isWheelZooming,
      isZoomingOrPanning,
      panScrollTimeout,
      wheelZoomTimeout,
    };
    const scaleTo = d3Zoom.scaleTo as unknown as ScaleToFn;
    const translateBy = d3Zoom.translateBy as unknown as TranslateByFn;

    if (panOnScroll && !zoomActivationKeyPressed && !userSelectionActive) {
      const panOnScrollWheelHandler = createPanOnScrollWheelHandler({
        d3Selection,
        interactionRefs: wheelInteractionRefs,
        panOnScrollMode,
        panOnScrollSpeed,
        scaleTo,
        syncViewportInteractionActive,
        translateBy,
        zoomActivationKeyPressed,
        zoomOnPinch,
      });
      d3Selection.on("wheel.zoom", panOnScrollWheelHandler, { passive: false });
      d3Selection.on(
        "wheel.pan-scroll-capture",
        (event: WheelEvent) => {
          if (
            !isPanScrolling.current ||
            !isWrappedWithClass(event, NO_WHEEL_CLASS_NAME) ||
            isWrappedWithClass(event, MANUAL_WHEEL_CLASS_NAME)
          ) {
            return;
          }
          panOnScrollWheelHandler(event);
        },
        { capture: true, passive: false },
      );
      return () => {
        d3Selection.on("wheel.pan-scroll-capture", null);
      };
    }

    d3Selection.on("wheel.pan-scroll-capture", null);

    if (typeof d3ZoomHandler === "undefined") {
      return;
    }

    d3Selection.on(
      "wheel.zoom",
      createDefaultWheelHandler({
        d3ZoomHandler,
        interactionRefs: wheelInteractionRefs,
        syncViewportInteractionActive,
        zoomActivationKeyPressed,
        zoomOnPinch,
      }),
      { passive: false },
    );
  }, [
    d3Selection,
    d3Zoom,
    d3ZoomHandler,
    host,
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    panScrollTimeout,
    wheelZoomTimeout,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    syncViewportInteractionActive,
    userSelectionActive,
    zoomActivationKeyPressed,
    zoomOnPinch,
  ]);
}
