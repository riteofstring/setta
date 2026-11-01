import { useCallback, useEffect, useRef } from "react";
import { getDndStateStore } from "../../dnd/dndState.js";
import type { WorkspaceHost } from "../../workspaceHost.js";
import { getReactFlowStore } from "../store.js";
import type { WorkspaceInteractionOptions } from "../options.js";
import { clamp, isMacOs } from "../utils.js";
import {
  isPinchZoomWheelEvent,
  isWorkspaceWindowOverlayWheelEvent,
  resolvePanOnScrollDelta,
  resolveWheelTargetDisposition,
  wheelDelta,
} from "../wheelPolicy.js";
import type { WorkspaceXyflowViewport } from "./types.js";
import { getWorkspaceXyflowRuntime } from "./workspaceXyflowRuntime.js";

const VIEWPORT_INTERACTION_ACTIVE_ATTRIBUTE =
  "data-viewport-interaction-active";

type WorkspaceXyflowWheelBehaviorOptions = Pick<
  WorkspaceInteractionOptions,
  | "maxZoom"
  | "minZoom"
  | "panOnScroll"
  | "panOnScrollMode"
  | "panOnScrollSpeed"
  | "zoomOnPinch"
  | "zoomOnScroll"
>;

type WorkspaceXyflowViewportSetter = (
  viewport: WorkspaceXyflowViewport,
) => void | Promise<unknown>;

type WorkspaceXyflowWheelBehaviorHandlers = {
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

function hasEnabledWheelGesture(
  event: WheelEvent,
  options: WorkspaceXyflowWheelBehaviorOptions,
  zoomActivationKeyPressed: boolean,
): boolean {
  if (zoomActivationKeyPressed || options.zoomOnScroll) {
    return true;
  }
  if (options.panOnScroll) {
    return true;
  }
  return options.zoomOnPinch && event.ctrlKey;
}

function isWheelInteractionBlockedByDnd(host: WorkspaceHost): boolean {
  const { isMovingFree, isSorting } = getDndStateStore(host).getState();
  return isMovingFree || isSorting;
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
  if (userSelectionActive) {
    return false;
  }
  if (!hasEnabledWheelGesture(event, options, zoomActivationKeyPressed)) {
    return false;
  }
  if (isWheelInteractionBlockedByDnd(host)) {
    return false;
  }
  return !event.ctrlKey || options.zoomOnPinch;
}

function getEffectivePanOnScroll(
  options: WorkspaceXyflowWheelBehaviorOptions,
  userSelectionActive: boolean,
  zoomActivationKeyPressed: boolean,
): boolean {
  return (
    options.panOnScroll && !zoomActivationKeyPressed && !userSelectionActive
  );
}

function acceptsCanvasWheelTarget(
  event: WheelEvent,
  disposition: ReturnType<typeof resolveWheelTargetDisposition>,
): boolean {
  if (disposition === "canvas") {
    return true;
  }
  if (disposition === "manual") {
    event.preventDefault();
  }
  return false;
}

function suppressWheelUpstream(
  event: WheelEvent,
  suppressUpstream: boolean,
  panOnScroll: boolean,
): void {
  if (suppressUpstream || panOnScroll) {
    event.stopImmediatePropagation();
  }
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
  initialViewport,
  options,
  renderer,
  setViewport,
}: {
  host: WorkspaceHost;
  initialViewport: WorkspaceXyflowViewport;
  options: WorkspaceXyflowWheelBehaviorOptions;
  renderer: HTMLElement | null;
  setViewport: WorkspaceXyflowViewportSetter;
}): WorkspaceXyflowWheelBehaviorHandlers {
  const latestRef = useRef<WheelBehaviorLatest>({ options, setViewport });
  const viewportRef = useRef(initialViewport);
  const interactionRefs = useRef<WheelInteractionRefs>({
    isPanScrolling: { current: false },
    isViewportMoving: { current: false },
    isWheelZooming: { current: false },
    panScrollTimeout: { current: undefined },
    wheelZoomTimeout: { current: undefined },
  });

  latestRef.current = { options, setViewport };

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
      if (event === null) {
        return;
      }
      interactionRefs.current.isViewportMoving.current = true;
      if (event.type === "mousedown") {
        getReactFlowStore(host).setState({ paneDragging: true });
      }
      syncViewportInteractionActive();
    },
    [host, syncViewportInteractionActive],
  );

  const onViewportMoveEnd = useCallback(
    (event: MouseEvent | TouchEvent | null) => {
      if (event === null) {
        return;
      }
      interactionRefs.current.isViewportMoving.current = false;
      getReactFlowStore(host).setState({ paneDragging: false });
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
      const currentViewport =
        getWorkspaceXyflowRuntime(host).getViewport() ?? viewportRef.current;
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
    const runWheelZoom = (event: WheelEvent): void => {
      startWheelZoomBurst();
      zoomToWheelPoint(event);
      scheduleWheelZoomBurstEnd();
    };
    const panViewportForWheel = (
      event: WheelEvent,
      isMacOS: boolean,
      options: WorkspaceXyflowWheelBehaviorOptions,
    ): void => {
      const currentViewport =
        getWorkspaceXyflowRuntime(host).getViewport() ?? viewportRef.current;
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
    const handleWheelEvent = (
      event: WheelEvent,
      suppressUpstream: boolean,
    ): void => {
      const { options } = latestRef.current;
      const { userSelectionActive, zoomActivationKeyPressed } =
        getReactFlowStore(host).getState();
      const panOnScroll = getEffectivePanOnScroll(
        options,
        userSelectionActive,
        zoomActivationKeyPressed,
      );
      const isMacOS = isMacOs();
      const targetDisposition = resolveWheelTargetDisposition({
        event,
        isMacOS,
        isPanScrolling:
          panOnScroll && interactionRefs.current.isPanScrolling.current,
        zoomActivationKeyPressed,
        zoomOnPinch: options.zoomOnPinch,
      });
      if (!acceptsCanvasWheelTarget(event, targetDisposition)) {
        return;
      }
      if (
        !shouldHandleDefaultWheelEvent({
          event,
          host,
          options,
          userSelectionActive,
          zoomActivationKeyPressed,
        })
      ) {
        return;
      }
      event.preventDefault();
      const pinchZoom = isPinchZoomWheelEvent({
        event,
        isMacOS,
        zoomOnPinch: options.zoomOnPinch,
      });
      suppressWheelUpstream(event, suppressUpstream, panOnScroll);
      if (!panOnScroll || pinchZoom) {
        runWheelZoom(event);
        return;
      }
      panViewportForWheel(event, isMacOS, options);
    };
    const bridgeWorkspaceWindowWheelEvent = (event: WheelEvent): void => {
      if (!isWorkspaceWindowOverlayWheelEvent(host, event)) {
        return;
      }
      handleWheelEvent(event, false);
    };
    const handleRendererWheelEvent = (event: WheelEvent): void => {
      handleWheelEvent(event, true);
    };

    renderer.addEventListener("wheel", handleRendererWheelEvent, {
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
      renderer.removeEventListener("wheel", handleRendererWheelEvent, true);
      renderer.ownerDocument.removeEventListener(
        "wheel",
        bridgeWorkspaceWindowWheelEvent,
        true,
      );
    };
  }, [host, renderer, syncViewportInteractionActive]);

  return { onViewportMoveEnd, onViewportMoveStart };
}
