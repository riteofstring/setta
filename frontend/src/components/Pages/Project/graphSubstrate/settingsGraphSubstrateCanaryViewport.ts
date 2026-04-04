import type { Position } from "utils/generatedTypes";
import {
  centerViewportOnWorldPoint,
  type GraphViewport,
} from "./viewportTransform";

const INITIAL_SCREEN_PADDING_PX = 48;

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
