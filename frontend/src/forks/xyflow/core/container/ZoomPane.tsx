import { interpolate } from "d3-interpolate";
import { pointer, select, type Selection as D3Selection } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import { useDndState } from "forks/dnd-kit/dndState";
import { useReactFlow } from "forks/xyflow/core/store";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { useAIFollow, useMisc, useSettings } from "state/definitions";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { PanOnScrollModeEnum } from "utils/generatedTypes";
import { clamp, isMacOs } from "utils/utils";
import { shallow } from "zustand/shallow";
import { getViewport } from "../hooks/useViewportHelper";
import { infiniteExtent } from "../store/initialState";
import type { CoordinateExtent, ReactFlowState, Viewport } from "../types";
import { getWheelDelta } from "../utils";

type InternalWheelEvent = WheelEvent & { internal?: boolean };
type ZoomFilterEvent = MouseEvent | TouchEvent | WheelEvent;
type ZoomSourceEvent = ZoomFilterEvent & { internal?: boolean };

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

const getEventButton = (event: ZoomFilterEvent): number =>
  "button" in event ? event.button : 0;

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
  useMisc.setState({ isPanScrolling: false });
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
});

const ZoomPane = ({
  zoomOnScroll = true,
  zoomOnPinch = true,
  panOnScroll = false,
  panOnScrollSpeed = 0.5,
  panOnScrollMode = PanOnScrollModeEnum.free,
  zoomOnDoubleClick = true,
  panOnDrag = true,
  zoomActivationKeyPressed,
  translateExtent = infiniteExtent,
  preventScrolling = true,
  children,
  wrapperDimensions,
}: ZoomPaneProps) => {
  const isZoomingOrPanning = useRef(false);
  const zoomPane = useRef<HTMLDivElement>(null);
  const { d3Zoom, d3Selection, d3ZoomHandler, userSelectionActive } =
    useReactFlow(selector, shallow);
  const isPanScrolling = useRef(false);
  const isWheelZooming = useRef(false);
  const panScrollTimeout = useRef<ReturnType<typeof setTimeout>>();
  const wheelZoomTimeout = useRef<ReturnType<typeof setTimeout>>();
  useZoomPaneInit(zoomPane, translateExtent);

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
  }, []);

  useEffect(() => {
    if (d3Selection && d3Zoom) {
      const scaleTo = d3Zoom.scaleTo as unknown as (
        selection: D3Selection<Element, unknown, null, undefined>,
        zoomLevel: number,
        point?: [number, number],
        event?: WheelEvent,
      ) => void;
      const translateBy = d3Zoom.translateBy as unknown as (
        selection: D3Selection<Element, unknown, null, undefined>,
        deltaX: number,
        deltaY: number,
        event?: InternalWheelEvent,
      ) => void;
      const startWheelZoomBurst = () => {
        clearTimeout(wheelZoomTimeout.current);
        if (!isWheelZooming.current) {
          isWheelZooming.current = true;
          syncViewportInteractionActive({
            isPanScrolling,
            isWheelZooming,
            isZoomingOrPanning,
          });
        }
      };
      const scheduleWheelZoomBurstEnd = () => {
        wheelZoomTimeout.current = setTimeout(() => {
          isWheelZooming.current = false;
          syncViewportInteractionActive({
            isPanScrolling,
            isWheelZooming,
            isZoomingOrPanning,
          });
        }, 180);
      };

      if (panOnScroll && !zoomActivationKeyPressed && !userSelectionActive) {
        d3Selection.on(
          "wheel.zoom",
          (event: WheelEvent) => {
            if (
              isWrappedWithClass(event, NO_WHEEL_CLASS_NAME) &&
              !zoomActivationKeyPressed &&
              !(event.ctrlKey && zoomOnPinch && isMacOs()) &&
              !(panOnScroll && isPanScrolling.current)
            ) {
              return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();

            const currentZoom = d3Selection.property("__zoom").k || 1;
            const _isMacOs = isMacOs();

            // macos sets ctrlKey=true for pinch gesture on a trackpad
            if (event.ctrlKey && zoomOnPinch && _isMacOs) {
              startWheelZoomBurst();
              const point = pointer(event);
              const pinchDelta = wheelDelta(event);
              const zoom = currentZoom * Math.pow(2, pinchDelta);
              scaleTo(d3Selection, zoom, point, event);
              scheduleWheelZoomBurstEnd();

              return;
            }

            // increase scroll speed in firefox
            // firefox: deltaMode === 1; chrome: deltaMode === 0
            const deltaNormalize = event.deltaMode === 1 ? 20 : 1;
            let deltaX =
              panOnScrollMode === PanOnScrollModeEnum.vertical
                ? 0
                : event.deltaX * deltaNormalize;
            let deltaY =
              panOnScrollMode === PanOnScrollModeEnum.horizontal
                ? 0
                : event.deltaY * deltaNormalize;

            // this enables vertical scrolling with shift + scroll on windows
            if (
              !_isMacOs &&
              event.shiftKey &&
              panOnScrollMode !== PanOnScrollModeEnum.vertical
            ) {
              deltaX = event.deltaY * deltaNormalize;
              deltaY = 0;
            }

            translateBy(
              d3Selection,
              -(deltaX / currentZoom) * panOnScrollSpeed,
              -(deltaY / currentZoom) * panOnScrollSpeed,
              { internal: true } as InternalWheelEvent,
            );
            clearTimeout(panScrollTimeout.current);

            // for pan on scroll we need to handle the event calls on our own
            // we can't use the start, zoom and end events from d3-zoom
            // because start and move gets called on every scroll event and not once at the beginning
            if (!isPanScrolling.current) {
              useMisc.setState({ isPanScrolling: true });
              isPanScrolling.current = true;
              syncViewportInteractionActive({
                isPanScrolling,
                isWheelZooming,
                isZoomingOrPanning,
              });
            }

            if (isPanScrolling.current) {
              panScrollTimeout.current = setTimeout(() => {
                isPanScrolling.current = false;
                useMisc.setState({ isPanScrolling: false });
                syncViewportInteractionActive({
                  isPanScrolling,
                  isWheelZooming,
                  isZoomingOrPanning,
                });
              }, 150);
            }
          },
          { passive: false },
        );
      } else if (typeof d3ZoomHandler !== "undefined") {
        d3Selection.on(
          "wheel.zoom",
          function (this: Element, event: WheelEvent, d: unknown) {
            if (
              !preventScrolling ||
              (isWrappedWithClass(event, NO_WHEEL_CLASS_NAME) &&
                !zoomActivationKeyPressed &&
                !(event.ctrlKey && zoomOnPinch && isMacOs()))
            ) {
              return;
            }

            event.preventDefault();
            startWheelZoomBurst();
            d3ZoomHandler.call(this, event, d);
            scheduleWheelZoomBurstEnd();
          },
          { passive: false },
        );
      }
    }
  }, [
    userSelectionActive,
    panOnScroll,
    panOnScrollSpeed,
    panOnScrollMode,
    d3Selection,
    d3Zoom,
    d3ZoomHandler,
    zoomActivationKeyPressed,
    zoomOnPinch,
    preventScrolling,
  ]);

  useEffect(() => {
    if (d3Zoom) {
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
    }
  }, [d3Zoom]);

  useEffect(() => {
    if (d3Zoom) {
      if (userSelectionActive && !isZoomingOrPanning.current) {
        d3Zoom.on("zoom", null);
      } else if (!userSelectionActive) {
        d3Zoom.on("zoom", (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
          if (
            useAIFollow.getState().isFollowTransitioning &&
            event.sourceEvent
          ) {
            return;
          }
          useReactFlow.setState({
            transform: [
              event.transform.x,
              event.transform.y,
              event.transform.k,
            ],
          });
        });
      }
    }
  }, [userSelectionActive, d3Zoom]);

  useEffect(() => {
    if (d3Zoom) {
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
        if (sourceEvent.type === "wheel") {
          useReactFlow.setState({ paneDragging: false });
          return;
        }
        isWheelZooming.current = false;
        clearTimeout(wheelZoomTimeout.current);
        useReactFlow.setState({ paneDragging: false });
        syncViewportInteractionActive({
          isPanScrolling,
          isWheelZooming,
          isZoomingOrPanning,
        });
      });
    }
  }, [d3Zoom]);

  useEffect(() => {
    if (d3Zoom) {
      d3Zoom.filter((event: ZoomFilterEvent) => {
        const zoomScroll = zoomActivationKeyPressed || zoomOnScroll;
        const pinchZoom = zoomOnPinch && event.ctrlKey;
        const eventButton = getEventButton(event);

        if (
          (panOnDrag === true ||
            (Array.isArray(panOnDrag) && panOnDrag.includes(1))) &&
          eventButton === 1 &&
          event.type === "mousedown" &&
          isWrappedWithClass(event, "react-flow__node")
        ) {
          return true;
        }

        // if all interactions are disabled, we prevent all zoom events
        if (
          !panOnDrag &&
          !zoomScroll &&
          !panOnScroll &&
          !zoomOnDoubleClick &&
          !zoomOnPinch
        ) {
          return false;
        }

        // during a selection we prevent all other interactions
        if (userSelectionActive) {
          return false;
        }

        // if zoom on double click is disabled, we prevent the double click event
        if (!zoomOnDoubleClick && event.type === "dblclick") {
          return false;
        }

        // if the target element is inside an element with the nowheel class, we prevent zooming
        if (
          isWrappedWithClass(event, NO_WHEEL_CLASS_NAME) &&
          event.type === "wheel" &&
          !zoomActivationKeyPressed &&
          !(event.ctrlKey && zoomOnPinch && isMacOs())
        ) {
          return false;
        }

        // if the target element is inside an element with the nopan class, we prevent panning
        if (
          isWrappedWithClass(event, NO_PAN_CLASS_NAME) &&
          (event.type !== "wheel" ||
            (panOnScroll &&
              event.type === "wheel" &&
              !zoomActivationKeyPressed))
        ) {
          return false;
        }

        if (!zoomOnPinch && event.ctrlKey && event.type === "wheel") {
          return false;
        }

        // when there is no scroll handling enabled, we prevent all wheel events
        if (
          !zoomScroll &&
          !panOnScroll &&
          !pinchZoom &&
          event.type === "wheel"
        ) {
          return false;
        }

        // if the pane is not movable, we prevent dragging it with mousestart or touchstart
        if (
          !panOnDrag &&
          (event.type === "mousedown" || event.type === "touchstart")
        ) {
          return false;
        }

        // if the pane is only movable using allowed clicks
        if (
          Array.isArray(panOnDrag) &&
          !panOnDrag.includes(eventButton) &&
          (event.type === "mousedown" || event.type === "touchstart")
        ) {
          return false;
        }

        if (
          useDndState.getState().isSorting ||
          useDndState.getState().isMovingFree
        ) {
          return false;
        }

        // We only allow right clicks if pan on drag is set to right click
        const buttonAllowed =
          (Array.isArray(panOnDrag) && panOnDrag.includes(eventButton)) ||
          !eventButton ||
          eventButton <= 1;

        // default filter for d3-zoom
        return (!event.ctrlKey || event.type === "wheel") && buttonAllowed;
      });
    }
  }, [
    userSelectionActive,
    d3Zoom,
    zoomOnScroll,
    zoomOnPinch,
    panOnScroll,
    zoomOnDoubleClick,
    panOnDrag,
    zoomActivationKeyPressed,
  ]);

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
