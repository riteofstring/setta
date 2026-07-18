import { Rectangle } from "pixi.js";
import { Viewport } from "pixi-viewport";

import { workflowGraphRendererResolution } from "./pixi-renderer-application";
import { configureViewportNavigation } from "./pixi-renderer-helpers";

export function createWorkflowGraphViewport({
  events,
  initialCameraState,
  maxZoom,
  minZoom,
  screenSize,
}) {
  const viewport = new Viewport({
    events,
    screenHeight: screenSize.height,
    screenWidth: screenSize.width,
    worldHeight: 4000,
    worldWidth: 4000,
  });
  viewport.forceHitArea = new Rectangle(0, 0, screenSize.width, screenSize.height);
  configureViewportNavigation(viewport, initialCameraState, { maxZoom, minZoom });
  return viewport;
}

export function resizeWorkflowGraphViewport({ app, devicePixelRatio, nextSize, viewport }) {
  app.renderer.resize(
    nextSize.width,
    nextSize.height,
    workflowGraphRendererResolution({
      cssHeight: nextSize.height,
      cssWidth: nextSize.width,
      devicePixelRatio,
    }),
  );
  viewport.resize(nextSize.width, nextSize.height, 4000, 4000);
  viewport.forceHitArea = new Rectangle(0, 0, nextSize.width, nextSize.height);
}
