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

export function fitSettingsGraphSubstrateCanaryViewport(
  bounds: GraphRect,
  viewportSize: GraphViewportSize,
  options: {
    minZoom: number;
    maxZoom: number;
    defaultZoomLevel: number;
    overviewWidth: number;
  },
): GraphViewport {
  const maxInitialZoom = Math.max(
    options.minZoom,
    Math.min(options.maxZoom, options.defaultZoomLevel),
  );

  return fitViewportToWorldRect(bounds, viewportSize, {
    minZoom: options.minZoom,
    maxZoom: maxInitialZoom,
    padding: AUTO_FIT_PADDING,
    centerScreenPoint: {
      x: viewportSize.width / 2 + options.overviewWidth,
      y: viewportSize.height / 2,
    },
  });
}
