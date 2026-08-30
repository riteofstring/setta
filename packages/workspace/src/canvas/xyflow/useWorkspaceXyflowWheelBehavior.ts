import { useCallback, useEffect, useRef } from "react";
import { getDndStateStore } from "../../dnd/dndState";
import {
  MANUAL_WHEEL_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "../../interaction";
import type { WorkspaceHost } from "../../workspaceHost";
import { getReactFlowStore } from "../store";
import type { WorkspaceInteractionOptions } from "../options";
import { clamp, isMacOs } from "../utils";
import {
  isPinchZoomWheelEvent,
  isWorkspaceWindowOverlayWheelEvent,
  isWrappedWithClass,
  resolvePanOnScrollDelta,
  resolveWheelTargetDisposition,
  wheelDelta,
} from "../wheelPolicy";
import type { WorkspaceXyflowViewport } from "./types";

const VIEWPORT_INTERACTION_ACTIVE_ATTRIBUTE =
  "data-viewport-interaction-active";

export type WorkspaceXyflowWheelBehaviorOptions = Pick<
  WorkspaceInteractionOptions,
  | "maxZoom"
  | "minZoom"
  | "panOnDrag"
  | "panOnScroll"
  | "panOnScrollMode"
  | "panOnScrollSpeed"
  | "zoomOnDoubleClick"
  | "zoomOnPinch"
  | "zoomOnScroll"
>;

export type WorkspaceXyflowViewportSetter = (
  viewport: WorkspaceXyflowViewport,
) => void | Promise<unknown>;

export type WorkspaceXyflowWheelBehaviorHandlers = {
  onViewportMoveEnd: (event: MouseEvent | TouchEvent | null) => void;
  onViewportMoveStart: (event: MouseEvent | TouchEvent | null) => void;
};

type WheelInteractionRefs = {
  isPanScrolling: { current: boolean };
  isViewportMoving: { current: boolean };
  isWheelZooming: { current: boolean };
  panScrollTimeout: { current: ReturnType<typeof setTimeout> | undefined };
  wheelZoomTimeout: { current: ReturnType<typeof setTimeout> | undefined };
};

type WheelBehaviorLatest = {
  options: WorkspaceXyflowWheelBehaviorOptions;
  setViewport: WorkspaceXyflowViewportSetter;
};

function areViewportsEqual(
  left: WorkspaceXyflowViewport,
  right: WorkspaceXyflowViewport,
): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

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

function shouldHandleDefaultWheelEvent({
  event,
  host,
  options,
  userSelectionActive,
  zoomActivationKeyPressed,
}: {
  event: WheelEvent;
  host: WorkspaceHost;
  options: WorkspaceXyflowWheelBehaviorOptions;
  userSelectionActive: boolean;
  zoomActivationKeyPressed: boolean;
}): boolean {
  const zoomOnScroll = zoomActivationKeyPressed || options.zoomOnScroll;
  if (userSelectionActive) {
    return false;
  }
  if (
    !options.panOnDrag &&
    !zoomOnScroll &&
    !options.panOnScroll &&
    !options.zoomOnDoubleClick &&
    !options.zoomOnPinch
  ) {
    return false;
  }
  const { isMovingFree, isSorting } = getDndStateStore(host).getState();
  if (isMovingFree || isSorting) {
    return false;
  }
  if (
    options.panOnScroll &&
    !zoomActivationKeyPressed &&
    isWrappedWithClass(event, NO_PAN_CLASS_NAME)
  ) {
    return false;
  }
  if (event.ctrlKey && !options.zoomOnPinch) {
    return false;
  }
  return (
    zoomOnScroll ||
    options.panOnScroll ||
    (options.zoomOnPinch && event.ctrlKey)
  );
}

function getWheelPoint(
  event: WheelEvent,
  renderer: HTMLElement,
): { x: number; y: number } {
  const bounds = renderer.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left - renderer.clientLeft,
    y: event.clientY - bounds.top - renderer.clientTop,
  };
}

function getPointerAnchoredViewport({
  event,
  nextZoom,
  renderer,
  viewport,
}: {
  event: WheelEvent;
  nextZoom: number;
  renderer: HTMLElement;
  viewport: WorkspaceXyflowViewport;
}): WorkspaceXyflowViewport {
  const point = getWheelPoint(event, renderer);
  const currentZoom = viewport.zoom || 1;
  const zoomRatio = nextZoom / currentZoom;
  return {
    x: point.x - (point.x - viewport.x) * zoomRatio,
    y: point.y - (point.y - viewport.y) * zoomRatio,
    zoom: nextZoom,
  };
}

export function useWorkspaceXyflowWheelBehavior({
  host,
  options,
  renderer,
  setViewport,
  viewport,
}: {
  host: WorkspaceHost;
  options: WorkspaceXyflowWheelBehaviorOptions;
  renderer: HTMLElement | null;
  setViewport: WorkspaceXyflowViewportSetter;
  viewport: WorkspaceXyflowViewport;
}): WorkspaceXyflowWheelBehaviorHandlers {
  const latestRef = useRef<WheelBehaviorLatest>({ options, setViewport });
  const viewportRef = useRef(viewport);
  const renderedViewportRef = useRef(viewport);
  const interactionRefs = useRef<WheelInteractionRefs>({
    isPanScrolling: { current: false },
    isViewportMoving: { current: false },
    isWheelZooming: { current: false },
    panScrollTimeout: { current: undefined },
    wheelZoomTimeout: { current: undefined },
  });

  latestRef.current = { options, setViewport };
  if (!areViewportsEqual(renderedViewportRef.current, viewport)) {
    renderedViewportRef.current = viewport;
    viewportRef.current = viewport;
  }

  const syncViewportInteractionActive = useCallback(() => {
    const interaction = interactionRefs.current;
    const active =
      interaction.isPanScrolling.current ||
      interaction.isViewportMoving.current ||
      interaction.isWheelZooming.current;
    markViewportInteractionActive(host, active);
    const reactFlowStore = getReactFlowStore(host);
    if (reactFlowStore.getState().viewportInteractionActive !== active) {
      reactFlowStore.setState({ viewportInteractionActive: active });
    }
  }, [host]);

  const onViewportMoveStart = useCallback(
    (event: MouseEvent | TouchEvent | null) => {
      interactionRefs.current.isViewportMoving.current = true;
      if (event?.type === "mousedown") {
        getReactFlowStore(host).setState({ paneDragging: true });
      }
      syncViewportInteractionActive();
    },
    [host, syncViewportInteractionActive],
  );

  const onViewportMoveEnd = useCallback(
    (event: MouseEvent | TouchEvent | null) => {
      interactionRefs.current.isViewportMoving.current = false;
      if (event !== null) {
        getReactFlowStore(host).setState({ paneDragging: false });
      }
      syncViewportInteractionActive();
    },
    [host, syncViewportInteractionActive],
  );

  useEffect(() => {
    const interaction = interactionRefs.current;
    return () => {
      interaction.isPanScrolling.current = false;
      interaction.isViewportMoving.current = false;
      interaction.isWheelZooming.current = false;
      clearTimeout(interaction.panScrollTimeout.current);
      clearTimeout(interaction.wheelZoomTimeout.current);
      markViewportInteractionActive(host, false);
      getReactFlowStore(host).setState({
        isPanScrolling: false,
        paneDragging: false,
        viewportInteractionActive: false,
      });
    };
  }, [host]);

  useEffect(() => {
    if (!renderer) {
      return;
    }
    const updateViewport = (nextViewport: WorkspaceXyflowViewport): void => {
      viewportRef.current = nextViewport;
      void latestRef.current.setViewport(nextViewport);
    };
    const startWheelZoomBurst = (): void => {
      const interaction = interactionRefs.current;
      clearTimeout(interaction.wheelZoomTimeout.current);
      if (interaction.isWheelZooming.current) {
        return;
      }
      interaction.isWheelZooming.current = true;
      syncViewportInteractionActive();
    };
    const scheduleWheelZoomBurstEnd = (): void => {
      const interaction = interactionRefs.current;
      interaction.wheelZoomTimeout.current = setTimeout(() => {
        interaction.isWheelZooming.current = false;
        syncViewportInteractionActive();
      }, 180);
    };
    const ensurePanScrollInteraction = (): void => {
      const interaction = interactionRefs.current;
      if (interaction.isPanScrolling.current) {
        return;
      }
      getReactFlowStore(host).setState({ isPanScrolling: true });
      interaction.isPanScrolling.current = true;
      syncViewportInteractionActive();
    };
    const schedulePanScrollInteractionEnd = (): void => {
      const interaction = interactionRefs.current;
      clearTimeout(interaction.panScrollTimeout.current);
      interaction.panScrollTimeout.current = setTimeout(() => {
        interaction.isPanScrolling.current = false;
        getReactFlowStore(host).setState({ isPanScrolling: false });
        syncViewportInteractionActive();
      }, 150);
    };
    const zoomToWheelPoint = (event: WheelEvent): void => {
      const { maxZoom, minZoom } = latestRef.current.options;
      const currentViewport = viewportRef.current;
      const currentZoom = currentViewport.zoom || 1;
      const nextZoom = clamp(
        currentZoom * Math.pow(2, wheelDelta(event)),
        minZoom,
        maxZoom,
      );
      updateViewport(
        getPointerAnchoredViewport({
          event,
          nextZoom,
          renderer,
          viewport: currentViewport,
        }),
      );
    };
    const handleWheelEvent = (event: WheelEvent): void => {
      const { options } = latestRef.current;
      const { userSelectionActive, zoomActivationKeyPressed } =
        getReactFlowStore(host).getState();
      const panOnScroll =
        options.panOnScroll &&
        !zoomActivationKeyPressed &&
        !userSelectionActive;
      const isMacOS = isMacOs();
      const targetDisposition = resolveWheelTargetDisposition({
        event,
        isMacOS,
        isPanScrolling:
          panOnScroll && interactionRefs.current.isPanScrolling.current,
        zoomActivationKeyPressed,
        zoomOnPinch: options.zoomOnPinch,
      });
      if (targetDisposition !== "canvas") {
        if (targetDisposition === "manual") {
          event.preventDefault();
        }
        return;
      }
      event.preventDefault();

      if (!panOnScroll) {
        startWheelZoomBurst();
        if (
          shouldHandleDefaultWheelEvent({
            event,
            host,
            options,
            userSelectionActive,
            zoomActivationKeyPressed,
          })
        ) {
          zoomToWheelPoint(event);
        }
        scheduleWheelZoomBurstEnd();
        return;
      }

      event.stopImmediatePropagation();
      if (
        isPinchZoomWheelEvent({
          event,
          isMacOS,
          zoomOnPinch: options.zoomOnPinch,
        })
      ) {
        startWheelZoomBurst();
        zoomToWheelPoint(event);
        scheduleWheelZoomBurstEnd();
        return;
      }

      const currentViewport = viewportRef.current;
      const { deltaX, deltaY } = resolvePanOnScrollDelta({
        event,
        isMacOS,
        panOnScrollMode: options.panOnScrollMode,
      });
      updateViewport({
        x: currentViewport.x - deltaX * options.panOnScrollSpeed,
        y: currentViewport.y - deltaY * options.panOnScrollSpeed,
        zoom: currentViewport.zoom,
      });
      ensurePanScrollInteraction();
      schedulePanScrollInteractionEnd();
    };
    const handlePanScrollCapture = (event: WheelEvent): void => {
      const { options } = latestRef.current;
      const { userSelectionActive, zoomActivationKeyPressed } =
        getReactFlowStore(host).getState();
      if (
        !options.panOnScroll ||
        zoomActivationKeyPressed ||
        userSelectionActive ||
        !interactionRefs.current.isPanScrolling.current ||
        !isWrappedWithClass(event, NO_WHEEL_CLASS_NAME) ||
        isWrappedWithClass(event, MANUAL_WHEEL_CLASS_NAME)
      ) {
        return;
      }
      handleWheelEvent(event);
    };
    const bridgeWorkspaceWindowWheelEvent = (event: WheelEvent): void => {
      if (!isWorkspaceWindowOverlayWheelEvent(host, event)) {
        return;
      }
      handleWheelEvent(event);
    };

    renderer.addEventListener("wheel", handleWheelEvent, { passive: false });
    renderer.addEventListener("wheel", handlePanScrollCapture, {
      capture: true,
      passive: false,
    });
    renderer.ownerDocument.addEventListener(
      "wheel",
      bridgeWorkspaceWindowWheelEvent,
      { capture: true, passive: false },
    );
    syncViewportInteractionActive();

    return () => {
      renderer.removeEventListener("wheel", handleWheelEvent);
      renderer.removeEventListener("wheel", handlePanScrollCapture, true);
      renderer.ownerDocument.removeEventListener(
        "wheel",
        bridgeWorkspaceWindowWheelEvent,
        true,
      );
    };
  }, [host, renderer, syncViewportInteractionActive]);

  return { onViewportMoveEnd, onViewportMoveStart };
}
