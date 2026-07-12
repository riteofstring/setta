/* global window */

import { Application } from "pixi.js";

import { hostScreenSize } from "./pixi-renderer-helpers";
import { loadNodeLabelBitmapFont } from "./pixi-renderer-label-font-loader";
import { abortInitializedAppIfNeeded, throwIfRendererInitAborted } from "./pixi-renderer-lifecycle";

const maxWorkflowGraphBackingPixels = 12_000_000;

export async function initializeWorkflowGraphApplication({ abortSignal, backgroundColor, host }) {
  throwIfRendererInitAborted(abortSignal);
  const app = new Application();
  const screenSize = hostScreenSize(host);
  await app.init({
    antialias: true,
    autoDensity: true,
    background: backgroundColor,
    height: screenSize.height,
    resolution: workflowGraphRendererResolution({
      cssHeight: screenSize.height,
      cssWidth: screenSize.width,
      devicePixelRatio: window.devicePixelRatio || 1,
    }),
    width: screenSize.width,
  });
  abortInitializedAppIfNeeded(app, abortSignal);
  const loadedNodeLabelFont = await loadNodeLabelBitmapFont();
  abortInitializedAppIfNeeded(app, abortSignal);
  return { app, loadedNodeLabelFont, screenSize };
}

export function workflowGraphRendererResolution({
  cssHeight,
  cssWidth,
  devicePixelRatio,
  maxBackingPixels = maxWorkflowGraphBackingPixels,
}) {
  const normalizedWidth = Math.max(1, cssWidth);
  const normalizedHeight = Math.max(1, cssHeight);
  const normalizedDevicePixelRatio = Math.max(1, devicePixelRatio || 1);
  const resolutionCap = Math.sqrt(maxBackingPixels / (normalizedWidth * normalizedHeight));
  return Math.max(0.5, Math.min(normalizedDevicePixelRatio, resolutionCap));
}

export function attachWorkflowGraphCanvas(host, canvas) {
  host.appendChild(canvas);
  canvas.dataset.testid = "workflow-graph-canvas";
  canvas.style.display = "block";
  canvas.style.height = "100%";
  canvas.style.width = "100%";
}
