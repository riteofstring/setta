import type { WorkspacePoint } from "../core.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";

export type WorkspaceKeyboardMoveDirection = "down" | "left" | "right" | "up";

export function workspaceKeyboardMoveDirectionForKey(
  key: string,
): WorkspaceKeyboardMoveDirection | null {
  if (key === "ArrowDown") {
    return "down";
  }
  if (key === "ArrowLeft") {
    return "left";
  }
  if (key === "ArrowRight") {
    return "right";
  }
  return key === "ArrowUp" ? "up" : null;
}

const UNSNAPPED_KEYBOARD_INCREMENT = 10;
const keyboardDirections = {
  down: { axis: "y", direction: 1 },
  left: { axis: "x", direction: -1 },
  right: { axis: "x", direction: 1 },
  up: { axis: "y", direction: -1 },
} as const satisfies Readonly<
  Record<WorkspaceKeyboardMoveDirection, { axis: "x" | "y"; direction: -1 | 1 }>
>;

function nextGridCoordinate(current: number, spacing: number, direction: -1 | 1): number {
  const gridIndex =
    direction === 1 ? Math.floor(current / spacing) + 1 : Math.ceil(current / spacing) - 1;
  return gridIndex * spacing;
}

export function moveWorkspaceRootWithKeyboard(
  position: WorkspacePoint,
  direction: WorkspaceKeyboardMoveDirection,
  gridOptions: Pick<ResolvedWorkspaceGridOptions, "snap" | "spacing">,
): WorkspacePoint {
  const movement = keyboardDirections[direction];
  const current = position[movement.axis];
  const spacing = gridOptions.spacing[movement.axis === "x" ? 0 : 1];
  const next = gridOptions.snap
    ? nextGridCoordinate(current, spacing, movement.direction)
    : current + UNSNAPPED_KEYBOARD_INCREMENT * movement.direction;
  return movement.axis === "x" ? { x: next, y: position.y } : { x: position.x, y: next };
}
