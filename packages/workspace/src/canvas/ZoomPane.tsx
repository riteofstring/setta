import { interpolate } from "d3-interpolate";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { shallow } from "zustand/shallow";
import { getDndStateStore } from "../dnd/dndState";
import {
  MANUAL_WHEEL_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "../interaction";
import { getInitialCanvasViewport } from "./documentViewportSync";
import { fitView } from "./fitView";
import { getWorkspaceOptionsStore, useWorkspaceOptions } from "./options";
import { infiniteExtent, getReactFlowStore, useReactFlow } from "./store";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { WorkspaceHost } from "../workspaceHost";
import type {
  CoordinateExtent,
  PanOnScrollMode,
  ReactFlowState,
} from "./types";
import { clamp, isMacOs } from "./utils";
import {
  isNativeVerticalWheelEvent,
  isPinchZoomWheelEvent,
  isWrappedWithClass,
  useZoomWheelBehavior,
  wheelDelta,
  type ViewportInteractionCleanupRefs,
  type ViewportInteractionRefs,
} from "./zoomWheelBehavior";

export {
  isNativeVerticalWheelEvent,
  resolvePanOnScrollDelta,
} from "./zoomWheelBehavior";

type ZoomFilterEvent = MouseEvent | TouchEvent | WheelEvent;
type ZoomSourceEvent = ZoomFilterEvent & { internal?: boolean };

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

type ZoomFilterParams = {
  event: ZoomFilterEvent;
  host: WorkspaceHost;
  panOnDrag: boolean | Array<number>;
  panOnScroll: boolean;
  userSelectionActive: boolean;
  zoomActivationKeyPressed?: boolean;
  zoomOnDoubleClick: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
};

const getEventButton = (event: ZoomFilterEvent): number =>
  "button" in event ? event.button : 0;

const isPointerStartEvent = (eventType: string): boolean =>
  eventType === "mousedown" || eventType === "touchstart";

const isWheelEventType = (eventType: string): boolean => eventType === "wheel";

const VIEWPORT_INTERACTION_ACTIVE_ATTRIBUTE =
  "data-viewport-interaction-active";

function markViewportInteractionActive(
  host: WorkspaceHost,
  active: boolean,
): void {
  const canvas = getReactFlowStore(host).getState().domNode;
  if (!canvas) {
    return;
  }
  if (active) {
    canvas.setAttribute(VIEWPORT_INTERACTION_ACTIVE_ATTRIBUTE, "true");
    return;
  }
  canvas.removeAttribute(VIEWPORT_INTERACTION_ACTIVE_ATTRIBUTE);
}

export function getViewportInteractionActiveValue({
  isPanScrolling,
  isWheelZooming,
  isZoomingOrPanning,
}: ViewportInteractionFlags): boolean {
  return isPanScrolling || isWheelZooming || isZoomingOrPanning;
}

function syncViewportInteractionActive({
  host,
  isPanScrolling,
  isWheelZooming,
  isZoomingOrPanning,
}: ViewportInteractionRefs) {
  const active = getViewportInteractionActiveValue({
    isPanScrolling: isPanScrolling.current,
    isWheelZooming: isWheelZooming.current,
    isZoomingOrPanning: isZoomingOrPanning.current,
  });
  markViewportInteractionActive(host, active);
  if (getReactFlowStore(host).getState().viewportInteractionActive !== active) {
    getReactFlowStore(host).setState({ viewportInteractionActive: active });
  }
}

export function resetViewportInteractionState({
  host,
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
  markViewportInteractionActive(host, false);
  getReactFlowStore(host).setState({
    isPanScrolling: false,
    paneDragging: false,
    viewportInteractionActive: false,
  });
}

const selector = (s: ReactFlowState) => ({
  d3Zoom: s.d3Zoom,
  d3Selection: s.d3Selection,
  d3ZoomHandler: s.d3ZoomHandler,
  userSelectionActive: s.userSelectionActive,
  fitViewOnInit: s.fitViewOnInit,
  fitViewOnInitDone: s.fitViewOnInitDone,
  fitViewOnInitOptions: s.fitViewOnInitOptions,
});

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
  if (
    !isWrappedWithClass(event, NO_WHEEL_CLASS_NAME) &&
    !isWrappedWithClass(event, MANUAL_WHEEL_CLASS_NAME) &&
    !(
      event instanceof WheelEvent &&
      isNativeVerticalWheelEvent(event, isMacOs())
    )
  ) {
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
  host,
  panOnDrag,
  panOnScroll,
  userSelectionActive,
  zoomOnDoubleClick,
  zoomOnPinch,
  zoomOnScroll,
}: {
  event: ZoomFilterEvent;
  eventButton: number;
  host: WorkspaceHost;
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

  const { isSorting, isMovingFree } = getDndStateStore(host).getState();
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
  host,
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
      host,
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
  host,
  isPanScrolling,
  isWheelZooming,
  isZoomingOrPanning,
  panScrollTimeout,
  wheelZoomTimeout,
}: ViewportInteractionCleanupRefs) {
  useEffect(() => {
    return () => {
      resetViewportInteractionState({
        host,
        isPanScrolling,
        isWheelZooming,
        isZoomingOrPanning,
        panScrollTimeout,
        wheelZoomTimeout,
      });
    };
  }, [
    host,
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    panScrollTimeout,
    wheelZoomTimeout,
  ]);
}

function useZoomLifecycleHandlers({
  d3Zoom,
  host,
  isPanScrolling,
  isWheelZooming,
  isZoomingOrPanning,
  userSelectionActive,
}: {
  d3Zoom: ReactFlowState["d3Zoom"];
  host: WorkspaceHost;
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
        host,
        isPanScrolling,
        isWheelZooming,
        isZoomingOrPanning,
      });

      if (sourceEvent.type === "mousedown") {
        getReactFlowStore(host).setState({ paneDragging: true });
      }
    });
  }, [d3Zoom, host, isPanScrolling, isWheelZooming, isZoomingOrPanning]);

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
      getReactFlowStore(host).setState({
        transform: [event.transform.x, event.transform.y, event.transform.k],
      });
    });
  }, [d3Zoom, host, isZoomingOrPanning, userSelectionActive]);

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
        host,
        isPanScrolling,
        isWheelZooming,
        isZoomingOrPanning,
      });
      getReactFlowStore(host).setState({ paneDragging: false });
    });
  }, [d3Zoom, host, isPanScrolling, isWheelZooming, isZoomingOrPanning]);
}

function useZoomFilterBinding({
  d3Zoom,
  host,
  panOnDrag,
  panOnScroll,
  userSelectionActive,
  zoomActivationKeyPressed,
  zoomOnDoubleClick,
  zoomOnPinch,
  zoomOnScroll,
}: {
  d3Zoom: ReactFlowState["d3Zoom"];
  host: WorkspaceHost;
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
        host,
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
    host,
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
  host,
  fitViewOnInit,
  fitViewOnInitDone,
  fitViewOnInitOptions,
}: {
  d3Selection: ReactFlowState["d3Selection"];
  d3Zoom: ReactFlowState["d3Zoom"];
  host: WorkspaceHost;
  fitViewOnInit: boolean;
  fitViewOnInitDone: boolean;
  fitViewOnInitOptions: ReactFlowState["fitViewOnInitOptions"];
}) {
  useEffect(() => {
    if (!d3Zoom || !d3Selection || !fitViewOnInit || fitViewOnInitDone) {
      return;
    }
    const didCompleteInitialFit = fitView(host, {
      initial: true,
      ...fitViewOnInitOptions,
    });
    if (didCompleteInitialFit) {
      getReactFlowStore(host).setState({
        fitViewOnInit: false,
        fitViewOnInitDone: true,
      });
    }
  }, [
    d3Selection,
    d3Zoom,
    host,
    fitViewOnInit,
    fitViewOnInitDone,
    fitViewOnInitOptions,
  ]);
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
  const host = useWorkspaceHost();
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
    host,
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    panScrollTimeout,
    wheelZoomTimeout,
  };
  useZoomPaneInit(host, zoomPane);
  useViewportInteractionCleanup(interactionRefs);
  useZoomWheelBehavior({
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
  });
  useZoomLifecycleHandlers({
    d3Zoom,
    host,
    isPanScrolling,
    isWheelZooming,
    isZoomingOrPanning,
    userSelectionActive,
  });
  useZoomFilterBinding({
    d3Zoom,
    host,
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
    host,
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
  host: WorkspaceHost,
  zoomPane: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    zoomPaneInit(host, zoomPane);

    return () => {
      markViewportInteractionActive(host, false);
      getReactFlowStore(host).setState({
        d3Zoom: null,
        d3Selection: null,
        d3ZoomHandler: undefined,
        domNode: null,
      });
    };
  }, [host, zoomPane]);
}

function zoomPaneInit(
  host: WorkspaceHost,
  zoomPane: RefObject<HTMLDivElement | null>,
) {
  if (zoomPane.current) {
    const initialViewport = getInitialCanvasViewport(host);
    const translateExtent = infiniteExtent;
    const bbox = zoomPane.current.getBoundingClientRect();
    const { minZoom, maxZoom } = getWorkspaceOptionsStore(host).getState();

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

    getReactFlowStore(host).setState({
      d3Zoom: d3ZoomInstance,
      d3Selection: selection,
      d3ZoomHandler,

      transform: [
        constrainedTransform.x,
        constrainedTransform.y,
        constrainedTransform.k,
      ],
      domNode: zoomPane.current.closest(".react-flow") as HTMLDivElement,
    });
  }
}
