/* global window */

import { Application } from "pixi.js";

import { hostScreenSize } from "./pixi-renderer-helpers";
import { loadNodeLabelBitmapFont } from "./pixi-renderer-label-font-loader";
import { abortInitializedAppIfNeeded, throwIfRendererInitAborted } from "./pixi-renderer-lifecycle";

export async function initializeWorkflowGraphApplication({ abortSignal, backgroundColor, host }) {
  throwIfRendererInitAborted(abortSignal);
  const app = new Application();
  const screenSize = hostScreenSize(host);
  await app.init({
    antialias: true,
    autoDensity: true,
    autoStart: false,
    background: backgroundColor,
    height: screenSize.height,
    resolution: window.devicePixelRatio || 1,
    sharedTicker: false,
    width: screenSize.width,
  });
  app.ticker.stop();
  abortInitializedAppIfNeeded(app, abortSignal);
  const loadedNodeLabelFont = await loadNodeLabelBitmapFont();
  abortInitializedAppIfNeeded(app, abortSignal);
  return { app, loadedNodeLabelFont, screenSize };
}

export function attachWorkflowGraphCanvas(host, canvas) {
  host.replaceChildren(canvas);
  canvas.dataset.testid = "workflow-graph-canvas";
  canvas.style.display = "block";
  canvas.style.height = "100%";
  canvas.style.width = "100%";
}
