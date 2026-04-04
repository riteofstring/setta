import type { Position } from "utils/generatedTypes";
import {
  centerViewportOnWorldPoint,
  fitViewportToWorldRect,
  type GraphRect,
  type GraphViewport,
  type GraphViewportSize,
} from "./viewportTransform";

const INITIAL_SCREEN_PADDING_PX = 48;
const AUTO_FIT_PADDING = 0.12;

export type SettingsGraphSubstrateCanaryViewportOwnership =
  | "auto-fit"
  | "local"
  | "shared";

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
