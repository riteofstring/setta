/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { interpolate } from "d3-interpolate";
import { pointer, select } from "d3-selection";
import {
  zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomTransform,
} from "d3-zoom";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useEffect, useRef } from "react";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { useProjectConfig, useSettings } from "state/definitions";
import { shallow } from "zustand/shallow";
import useResizeHandler from "../../hooks/useResizeHandler";
import { containerStyle } from "../../styles";
import {
  CoordinateExtent,
  PanOnScrollMode,
  type ReactFlowState,
  type Viewport,
} from "../../types";
import { clamp, isMacOs } from "../../utils";
import type { FlowRendererProps } from "../FlowRenderer";

type ZoomPaneProps = Omit<
  FlowRendererProps,
  "noDragClassName" | "selectionOnDrag"
>;

const viewChanged = (
  prevViewport: Viewport,
  eventTransform: ZoomTransform,
): boolean =>
  prevViewport.x !== eventTransform.x ||
  prevViewport.y !== eventTransform.y ||
  prevViewport.zoom !== eventTransform.k;

const eventToFlowTransform = (eventTransform: ZoomTransform): Viewport => ({
  x: eventTransform.x,
  y: eventTransform.y,
  zoom: eventTransform.k,
});

const isWrappedWithClass = (event: any, className: string | undefined) =>
  event.target.closest(`.${className}`);

const isRightClickPan = (
  panOnDrag: FlowRendererProps["panOnDrag"],
  usedButton: number,
) => usedButton === 2 && Array.isArray(panOnDrag) && panOnDrag.includes(2);

const wheelDelta = (event: any) => {
  const factor = event.ctrlKey && isMacOs() ? 10 : 1;

  return (
    -event.deltaY *
    (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002) *
    factor
  );
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
  panOnScrollMode = PanOnScrollMode.Free,
  zoomOnDoubleClick = true,
  elementsSelectable,
  panOnDrag = true,
  translateExtent,
  preventScrolling = true,
  children,
  noWheelClassName,
  noPanClassName,
}: ZoomPaneProps) => {
  const timerId = useRef<ReturnType<typeof setTimeout>>();
  const isZoomingOrPanning = useRef(false);
  const zoomedWithRightMouseButton = useRef(false);
  const zoomPane = useRef<HTMLDivElement>(null);
  const prevTransform = useRef<Viewport>({ x: 0, y: 0, zoom: 0 });
  const { d3Zoom, d3Selection, d3ZoomHandler, userSelectionActive } =
    useReactFlow(selector, shallow);
  // const zoomActivationKeyPressed = useKeyPress(zoomActivationKeyCode);
  const zoomActivationKeyPressed = false;
  const mouseButton = useRef<number>(0);
  const isPanScrolling = useRef(false);
  const panScrollTimeout = useRef<ReturnType<typeof setTimeout>>();
  const initialViewport = useProjectConfig((x) => x.viewport, _.isEqual);

  useResizeHandler(zoomPane);

  useEffect(() => {
    if (zoomPane.current) {
      const bbox = zoomPane.current.getBoundingClientRect();
      // .interpolate(interpolate) makes the interpolations linear instead of curved
      const { minZoom, maxZoom } = useSettings.getState();
      const d3ZoomInstance = zoom()
        .interpolate(interpolate)
        .scaleExtent([minZoom, maxZoom])
        .translateExtent(translateExtent);
      const selection = select(zoomPane.current as Element).call(
        d3ZoomInstance,
      );
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

      useReactFlow.setState({
        d3Zoom: d3ZoomInstance,
        d3Selection: selection,
        d3ZoomHandler: selection.on("wheel.zoom"),
        // we need to pass transform because zoom handler is not registered when we set the initial transform
        transform: [
          constrainedTransform.x,
          constrainedTransform.y,
          constrainedTransform.k,
        ],
        domNode: zoomPane.current.closest(".react-flow") as HTMLDivElement,
      });
    }
  }, [initialViewport.x, initialViewport.y, initialViewport.zoom]);

  useEffect(() => {
    if (d3Selection && d3Zoom) {
      if (panOnScroll && !zoomActivationKeyPressed && !userSelectionActive) {
        d3Selection.on(
          "wheel.zoom",
          (event: any) => {
            if (isWrappedWithClass(event, noWheelClassName)) {
              return false;
            }
            event.preventDefault();
            event.stopImmediatePropagation();

            const currentZoom = d3Selection.property("__zoom").k || 1;
            const _isMacOs = isMacOs();

            // macos sets ctrlKey=true for pinch gesture on a trackpad
            if (event.ctrlKey && zoomOnPinch && _isMacOs) {
              const point = pointer(event);
              const pinchDelta = wheelDelta(event);
              const zoom = currentZoom * Math.pow(2, pinchDelta);
              // @ts-ignore
              d3Zoom.scaleTo(d3Selection, zoom, point, event);

              return;
            }

            // increase scroll speed in firefox
            // firefox: deltaMode === 1; chrome: deltaMode === 0
            const deltaNormalize = event.deltaMode === 1 ? 20 : 1;
            let deltaX =
              panOnScrollMode === PanOnScrollMode.Vertical
                ? 0
                : event.deltaX * deltaNormalize;
            let deltaY =
              panOnScrollMode === PanOnScrollMode.Horizontal
                ? 0
                : event.deltaY * deltaNormalize;

            // this enables vertical scrolling with shift + scroll on windows
            if (
              !_isMacOs &&
              event.shiftKey &&
              panOnScrollMode !== PanOnScrollMode.Vertical
            ) {
              deltaX = event.deltaY * deltaNormalize;
              deltaY = 0;
            }

            d3Zoom.translateBy(
              d3Selection,
              -(deltaX / currentZoom) * panOnScrollSpeed,
              -(deltaY / currentZoom) * panOnScrollSpeed,
              // @ts-ignore
              { internal: true },
            );
            const nextViewport = eventToFlowTransform(
              d3Selection.property("__zoom"),
            );
            clearTimeout(panScrollTimeout.current);

            // for pan on scroll we need to handle the event calls on our own
            // we can't use the start, zoom and end events from d3-zoom
            // because start and move gets called on every scroll event and not once at the beginning
            if (!isPanScrolling.current) {
              isPanScrolling.current = true;
            }
          },
          { passive: false },
        );
      } else if (typeof d3ZoomHandler !== "undefined") {
        d3Selection.on(
          "wheel.zoom",
          function (this: any, event: any, d: any) {
            if (
              !preventScrolling ||
              isWrappedWithClass(event, noWheelClassName)
            ) {
              return null;
            }

            event.preventDefault();
            d3ZoomHandler.call(this, event, d);
          },
          { passive: false },
        );
      }
    }
  }, [
    userSelectionActive,
    panOnScroll,
    panOnScrollMode,
    d3Selection,
    d3Zoom,
    d3ZoomHandler,
    zoomActivationKeyPressed,
    zoomOnPinch,
    preventScrolling,
    noWheelClassName,
  ]);

  useEffect(() => {
    if (d3Zoom) {
      d3Zoom.on("start", (event: D3ZoomEvent<HTMLDivElement, any>) => {
        if (!event.sourceEvent || event.sourceEvent.internal) {
          return null;
        }
        // we need to remember it here, because it's always 0 in the "zoom" event
        mouseButton.current = event.sourceEvent?.button;

        const flowTransform = eventToFlowTransform(event.transform);

        isZoomingOrPanning.current = true;
        prevTransform.current = flowTransform;

        if (event.sourceEvent?.type === "mousedown") {
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
        d3Zoom.on("zoom", (event: D3ZoomEvent<HTMLDivElement, any>) => {
          useReactFlow.setState({
            transform: [
              event.transform.x,
              event.transform.y,
              event.transform.k,
            ],
          });

          zoomedWithRightMouseButton.current = !!isRightClickPan(
            panOnDrag,
            mouseButton.current ?? 0,
          );
        });
      }
    }
  }, [userSelectionActive, d3Zoom, panOnDrag]);

  useEffect(() => {
    if (d3Zoom) {
      d3Zoom.on("end", (event: D3ZoomEvent<HTMLDivElement, any>) => {
        if (!event.sourceEvent || event.sourceEvent.internal) {
          return null;
        }

        isZoomingOrPanning.current = false;
        useReactFlow.setState({ paneDragging: false });
        zoomedWithRightMouseButton.current = false;
      });
    }
  }, [d3Zoom, panOnScroll, panOnDrag]);

  useEffect(() => {
    if (d3Zoom) {
      d3Zoom.filter((event: any) => {
        const zoomScroll = zoomActivationKeyPressed || zoomOnScroll;
        const pinchZoom = zoomOnPinch && event.ctrlKey;

        if (
          (panOnDrag === true ||
            (Array.isArray(panOnDrag) && panOnDrag.includes(1))) &&
          event.button === 1 &&
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
          isWrappedWithClass(event, noWheelClassName) &&
          event.type === "wheel"
        ) {
          return false;
        }

        // if the target element is inside an element with the nopan class, we prevent panning
        if (
          isWrappedWithClass(event, noPanClassName) &&
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
          !panOnDrag.includes(event.button) &&
          (event.type === "mousedown" || event.type === "touchstart")
        ) {
          return false;
        }

        // We only allow right clicks if pan on drag is set to right click
        const buttonAllowed =
          (Array.isArray(panOnDrag) && panOnDrag.includes(event.button)) ||
          !event.button ||
          event.button <= 1;

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
    elementsSelectable,
    zoomActivationKeyPressed,
  ]);

  return (
    <div className="react-flow__renderer" ref={zoomPane} style={containerStyle}>
      {children}
    </div>
  );
};

export default ZoomPane;
