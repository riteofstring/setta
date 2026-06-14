import { Rectangle } from "pixi.js";

const filterAreaScreenPaddingPx = 96;

export function syncWorkflowGraphFilterAreas({ filteredGraphics, viewport }) {
  const topLeft = viewport.toWorld({
    x: -filterAreaScreenPaddingPx,
    y: -filterAreaScreenPaddingPx,
  });
  const bottomRight = viewport.toWorld({
    x: viewport.screenWidth + filterAreaScreenPaddingPx,
    y: viewport.screenHeight + filterAreaScreenPaddingPx,
  });
  const left = Math.min(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  const area = new Rectangle(
    left,
    top,
    Math.max(1, Math.abs(bottomRight.x - topLeft.x)),
    Math.max(1, Math.abs(bottomRight.y - topLeft.y)),
  );
  for (const graphics of filteredGraphics) {
    graphics.filterArea = area;
  }
}
