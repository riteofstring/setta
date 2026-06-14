import { cameraState, clamp } from "./pixi-renderer-helpers";

const defaultFitMaxZoom = 1;
const defaultFitPadding = 96;

export function createWorkflowGraphFitToGraph({
  app,
  commitCameraChange,
  maxZoom,
  minZoom,
  nodes,
  viewport,
}) {
  return function fitCameraToGraph({
    maxZoom: requestedMaxZoom = defaultFitMaxZoom,
    padding,
  } = {}) {
    const bounds = graphFitBounds(nodes);
    if (bounds === null) {
      return {
        camera: cameraState(viewport),
        ok: false,
        reason: "empty-graph",
      };
    }

    const screen = graphFitScreen(viewport, app.canvas);
    const safePadding = safeFitPadding(padding);
    const nextZoom = graphFitZoom({
      bounds,
      maxZoom,
      minZoom,
      requestedMaxZoom,
      safePadding,
      screen,
    });
    viewport.setZoom(nextZoom);
    viewport.moveCenter(bounds.centerX, bounds.centerY);
    commitCameraChange();
    return {
      bounds,
      camera: cameraState(viewport),
      ok: true,
      padding: safePadding,
      screen,
    };
  };
}

function graphFitBounds(nodes) {
  if (nodes.length === 0) {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + node.height);
  }
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return {
    bottom,
    centerX: left + width / 2,
    centerY: top + height / 2,
    height,
    left,
    right,
    top,
    width,
  };
}

function graphFitScreen(viewport, canvas) {
  return {
    height: positiveDimension(viewport.screenHeight, canvas.clientHeight),
    width: positiveDimension(viewport.screenWidth, canvas.clientWidth),
  };
}

function graphFitZoom({ bounds, maxZoom, minZoom, requestedMaxZoom, safePadding, screen }) {
  const availableWidth = Math.max(1, screen.width - safePadding * 2);
  const availableHeight = Math.max(1, screen.height - safePadding * 2);
  const maximumZoom = Math.max(
    minZoom,
    Math.min(maxZoom, finiteNumber(requestedMaxZoom, defaultFitMaxZoom)),
  );
  return clamp(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
    minZoom,
    maximumZoom,
  );
}

function positiveDimension(...candidates) {
  for (const candidate of candidates) {
    if (candidate > 0) {
      return candidate;
    }
  }
  return 1;
}

function safeFitPadding(padding) {
  return Math.max(0, finiteNumber(padding, defaultFitPadding));
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
