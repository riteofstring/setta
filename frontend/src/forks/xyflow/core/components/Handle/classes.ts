import type { HandlePosition } from "../../types";

export const HANDLE_CLASS_NAME = "canvas-flow__handle";
export const HANDLE_CONNECTING_CLASS_NAME = "canvas-flow__handle-connecting";
export const HANDLE_VALID_CLASS_NAME = "canvas-flow__handle-valid";

export function getHandlePositionClassName(position: HandlePosition): string {
  return `canvas-flow__handle-${position}`;
}
