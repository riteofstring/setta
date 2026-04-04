import { CLOSED_PANE_WIDTH } from "utils/constants";
import { PanOnScrollModeEnum, type Position } from "utils/generatedTypes";
import {
  centerViewportOnWorldPoint,
  fitViewportToWorldRect,
  type GraphRect,
  type GraphViewport,
  type GraphViewportSize,
  translateViewport,
  zoomViewportAroundScreenPoint,
} from "./viewportTransform";

const INITIAL_SCREEN_PADDING_PX = 48;
const AUTO_FIT_PADDING = 0.12;

export type SettingsGraphSubstrateCanaryViewportOwnership =
  | "auto-fit"
  | "local"
  | "shared";

export type SettingsGraphSubstrateCanaryWheelEvent = {
  ctrlKey: boolean;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
};

export type SettingsGraphSubstrateCanaryWheelBehavior = {
  isMacOs: boolean;
  maxZoom: number;
  minZoom: number;
  panOnScroll: boolean;
  panOnScrollMode: PanOnScrollModeEnum;
  panOnScrollSpeed: number;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
};

export type SettingsGraphSubstrateCanaryWheelOutcome =
  | { kind: "pan-scroll"; nextViewport: GraphViewport }
  | { kind: "zoom"; nextViewport: GraphViewport }
  | null;

export type SettingsGraphSubstrateCanaryEffectivePaneWidths = {
  overviewWidth: number;
  uiEditorWidth: number;
};

export function resolveSettingsGraphSubstrateCanaryFallbackViewport(
  defaultZoomLevel: number,
  sectionPosition: Position | null,
): GraphViewport | null {
  if (!sectionPosition) {
    return null;
  }
  return centerViewportOnWorldPoint(
    { x: 0, y: 0, zoom: defaultZoomLevel },
    {
      worldPoint: sectionPosition,
      screenPoint: {
        x: INITIAL_SCREEN_PADDING_PX,
        y: INITIAL_SCREEN_PADDING_PX,
      },
      zoom: defaultZoomLevel,
    },
  );
}

export function resolveSettingsGraphSubstrateCanarySharedViewport(
  sharedProjectViewport: GraphViewport | null,
  sharedReactFlowViewport: GraphViewport | null,
  fallbackViewport: GraphViewport | null,
): GraphViewport | null {
  if (sharedProjectViewport) {
    return sharedProjectViewport;
  }
  if (!sharedReactFlowViewport) {
    return null;
  }
  if (
    fallbackViewport &&
    sharedReactFlowViewport.x === fallbackViewport.x &&
    sharedReactFlowViewport.y === fallbackViewport.y &&
    sharedReactFlowViewport.zoom === fallbackViewport.zoom
  ) {
    return null;
  }
  return sharedReactFlowViewport;
}

export function resolveSettingsGraphSubstrateCanaryViewport(
  currentViewport: GraphViewport | null,
  sharedViewport: GraphViewport | null,
  fallbackViewport: GraphViewport | null,
): GraphViewport | null {
  if (currentViewport) {
    return currentViewport;
  }
  if (sharedViewport) {
    return sharedViewport;
  }
  return fallbackViewport;
}

export function shouldAutoFitSettingsGraphSubstrateCanaryViewport(
  currentViewport: GraphViewport | null,
  sharedViewport: GraphViewport | null,
): boolean {
  return currentViewport === null && sharedViewport === null;
}

export function shouldPersistSettingsGraphSubstrateCanaryViewport(
  sharedProjectViewport: GraphViewport | null,
  viewportOwnership: SettingsGraphSubstrateCanaryViewportOwnership | null,
): boolean {
  return sharedProjectViewport !== null || viewportOwnership === "local";
}

export function resolveSettingsGraphSubstrateCanaryEffectivePaneWidths({
  overviewVisible,
  overviewTrueWidth,
  uiEditorVisible,
  uiEditorTrueWidth,
}: {
  overviewVisible: boolean;
  overviewTrueWidth: number;
  uiEditorVisible: boolean;
  uiEditorTrueWidth: number;
}): SettingsGraphSubstrateCanaryEffectivePaneWidths {
  return {
    overviewWidth: Math.max(
      overviewVisible ? overviewTrueWidth : CLOSED_PANE_WIDTH,
      0,
    ),
    uiEditorWidth: Math.max(
      uiEditorVisible ? uiEditorTrueWidth : CLOSED_PANE_WIDTH,
      0,
    ),
  };
}

export function fitSettingsGraphSubstrateCanaryViewport(
  bounds: GraphRect,
  viewportSize: GraphViewportSize,
  options: {
    minZoom: number;
    maxZoom: number;
    defaultZoomLevel: number;
    overviewWidth: number;
    uiEditorWidth: number;
  },
): GraphViewport {
  const maxInitialZoom = Math.max(
    options.minZoom,
    Math.min(options.maxZoom, options.defaultZoomLevel),
  );
  const visibleViewportSize =
    resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
      viewportSize,
      options.overviewWidth,
      options.uiEditorWidth,
    );

  return fitViewportToWorldRect(bounds, visibleViewportSize, {
    minZoom: options.minZoom,
    maxZoom: maxInitialZoom,
    padding: AUTO_FIT_PADDING,
    centerScreenPoint: {
      x: options.overviewWidth + visibleViewportSize.width / 2,
      y: visibleViewportSize.height / 2,
    },
  });
}

export function resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
  viewportSize: GraphViewportSize,
  overviewWidth: number,
  uiEditorWidth: number,
): GraphViewportSize {
  return {
    width: Math.max(viewportSize.width - overviewWidth - uiEditorWidth, 0),
    height: Math.max(viewportSize.height, 0),
  };
}

export function resolveSettingsGraphSubstrateCanaryZoomControlScreenPoint(
  viewportSize: GraphViewportSize,
): Position | null {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return null;
  }
  return {
    x: viewportSize.width / 2,
    y: viewportSize.height / 2,
  };
}

export function resolveSettingsGraphSubstrateCanaryWheelOutcome(
  viewport: GraphViewport,
  anchorScreenPoint: Position,
  wheelEvent: SettingsGraphSubstrateCanaryWheelEvent,
  behavior: SettingsGraphSubstrateCanaryWheelBehavior,
): SettingsGraphSubstrateCanaryWheelOutcome {
  const isPinchZoom =
    wheelEvent.ctrlKey && behavior.zoomOnPinch && behavior.isMacOs;

  if (
    behavior.panOnScroll &&
    !behavior.zoomActivationKeyPressed &&
    !isPinchZoom
  ) {
    const nextViewport = resolvePanScrollViewport(
      viewport,
      wheelEvent,
      behavior,
    );
    if (!nextViewport) {
      return null;
    }
    return {
      kind: "pan-scroll",
      nextViewport,
    };
  }

  if (
    !behavior.zoomActivationKeyPressed &&
    !behavior.zoomOnScroll &&
    !isPinchZoom
  ) {
    return null;
  }

  const wheelFactor = wheelEvent.ctrlKey && behavior.isMacOs ? 10 : 1;
  const nextZoom = Math.min(
    behavior.maxZoom,
    Math.max(
      behavior.minZoom,
      viewport.zoom *
        Math.pow(
          2,
          -wheelEvent.deltaY *
            resolveWheelDeltaModeFactor(wheelEvent.deltaMode) *
            wheelFactor,
        ),
    ),
  );
  if (nextZoom === viewport.zoom) {
    return null;
  }

  return {
    kind: "zoom",
    nextViewport: zoomViewportAroundScreenPoint(
      viewport,
      anchorScreenPoint,
      nextZoom,
    ),
  };
}

function resolvePanScrollViewport(
  viewport: GraphViewport,
  wheelEvent: SettingsGraphSubstrateCanaryWheelEvent,
  behavior: SettingsGraphSubstrateCanaryWheelBehavior,
): GraphViewport | null {
  const deltaNormalize = wheelEvent.deltaMode === 1 ? 20 : 1;
  let deltaX =
    behavior.panOnScrollMode === PanOnScrollModeEnum.vertical
      ? 0
      : wheelEvent.deltaX * deltaNormalize;
  let deltaY =
    behavior.panOnScrollMode === PanOnScrollModeEnum.horizontal
      ? 0
      : wheelEvent.deltaY * deltaNormalize;

  if (
    !behavior.isMacOs &&
    wheelEvent.shiftKey &&
    behavior.panOnScrollMode !== PanOnScrollModeEnum.vertical
  ) {
    deltaX = wheelEvent.deltaY * deltaNormalize;
    deltaY = 0;
  }

  if (deltaX === 0 && deltaY === 0) {
    return null;
  }

  return translateViewport(viewport, {
    x: -deltaX * behavior.panOnScrollSpeed,
    y: -deltaY * behavior.panOnScrollSpeed,
  });
}

function resolveWheelDeltaModeFactor(deltaMode: number): number {
  if (deltaMode === 1) {
    return 0.05;
  }
  if (deltaMode === 0) {
    return 0.002;
  }
  return 1;
}
