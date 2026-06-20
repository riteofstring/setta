/* global ResizeObserver */

import { Rectangle } from "pixi.js";

import { hostScreenSize } from "./pixi-renderer-helpers";
import { drawWorkspaceBackdrop, drawWorkspaceVignette } from "./pixi-renderer-node-geometry";

export function observeWorkflowGraphRendererResize({
  app,
  backdrop,
  getFoundationStyle,
  host,
  isDestroyed,
  labels,
  onResize,
  vignette,
  vignetteGradient,
  viewport,
}) {
  const resizeObserver = new ResizeObserver(() => {
    if (isDestroyed()) {
      return;
    }
    const nextSize = hostScreenSize(host);
    app.renderer.resize(nextSize.width, nextSize.height);
    viewport.resize(nextSize.width, nextSize.height, 4000, 4000);
    viewport.forceHitArea = new Rectangle(0, 0, nextSize.width, nextSize.height);
    onResize?.();
    drawWorkspaceBackdrop(backdrop, nextSize, getFoundationStyle());
    drawWorkspaceVignette(vignette, nextSize, vignetteGradient, getFoundationStyle());
    labels.resetVisibleLabels();
    labels.syncVisibleLabels();
  });
  resizeObserver.observe(host);
  return resizeObserver;
}
