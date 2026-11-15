import { getWorkspaceGraphViewportPoint } from "./geometry.js";
import type { WorkspaceGraphObstacle } from "./routing.js";

const SECTION = "[data-workspace-section-shell]";

export function getWorkspaceGraphObstacles(
  root: HTMLElement,
  origin: DOMRect,
  transform: readonly [number, number, number],
): WorkspaceGraphObstacle[] {
  const obstacles: WorkspaceGraphObstacle[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(SECTION)) {
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    const children = [...element.querySelectorAll<HTMLElement>(SECTION)];
    const bottom = children.length
      ? Math.min(
          ...children.map((child) => child.getBoundingClientRect().top),
        ) -
        4 * transform[2]
      : box.bottom;
    if (bottom <= box.top) continue;
    const a = getWorkspaceGraphViewportPoint(
      { x: box.left, y: box.top },
      origin,
      transform,
    );
    const b = getWorkspaceGraphViewportPoint(
      { x: box.right, y: Math.min(box.bottom, bottom) },
      origin,
      transform,
    );
    obstacles.push({ left: a.x, top: a.y, right: b.x, bottom: b.y });
  }
  return obstacles;
}

export function sameWorkspaceGraphObstacles(
  a: readonly WorkspaceGraphObstacle[],
  b: readonly WorkspaceGraphObstacle[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (rect, i) =>
        rect.left === b[i]!.left &&
        rect.top === b[i]!.top &&
        rect.right === b[i]!.right &&
        rect.bottom === b[i]!.bottom,
    )
  );
}
