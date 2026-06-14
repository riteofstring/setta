import { Rectangle } from "pixi.js";

const filterAreaScreenPaddingPx = 96;

export function createWorkflowGraphFilterAreaSync({ debugMetrics, filteredGraphics, viewport }) {
  let currentFilterArea = null;
  let filterAreaSkipCount = 0;
  let filterAreaSyncCount = 0;

  return {
    debugSnapshot: () => ({
      filterAreaSkipCount,
      filterAreaSyncCount,
    }),
    sync,
  };

  function sync({ force = false } = {}) {
    if (
      !force &&
      currentFilterArea &&
      rectangleContainsRectangle(currentFilterArea, workflowGraphViewportWorldBounds(viewport))
    ) {
      filterAreaSkipCount += 1;
      return false;
    }
    debugMetrics.measure("filter-area-sync", () => {
      currentFilterArea = syncWorkflowGraphFilterAreas({ filteredGraphics, viewport });
    });
    filterAreaSyncCount += 1;
    return true;
  }
}

function syncWorkflowGraphFilterAreas({ filteredGraphics, viewport }) {
  const area = workflowGraphFilterAreaForViewport(viewport);
  for (const graphics of filteredGraphics) {
    graphics.filterArea = area;
  }
  return area;
}

function workflowGraphFilterAreaForViewport(viewport) {
  const bounds = viewportWorldBounds(viewport, filterAreaScreenPaddingPx);
  return new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
}

function workflowGraphViewportWorldBounds(viewport) {
  return viewportWorldBounds(viewport, 0);
}

function rectangleContainsRectangle(outer, inner) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function viewportWorldBounds(viewport, paddingScreenPx) {
  const topLeft = viewport.toWorld({
    x: -paddingScreenPx,
    y: -paddingScreenPx,
  });
  const bottomRight = viewport.toWorld({
    x: viewport.screenWidth + paddingScreenPx,
    y: viewport.screenHeight + paddingScreenPx,
  });
  const left = Math.min(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  return {
    height: Math.max(1, Math.abs(bottomRight.y - topLeft.y)),
    width: Math.max(1, Math.abs(bottomRight.x - topLeft.x)),
    x: left,
    y: top,
  };
}
