import { useEffect } from "react";
import type { Position } from "../document/types";

// The reference's `forks/xyflow/core/utils/mouseLocation.ts`: the last pointer position the
// canvas observed, in client coordinates, for operations that act where the pointer is instead
// of on a target. The reference seeds it at the origin and acts there before the pointer has
// ever moved; the package leaves it empty so such an operation declines until there is a
// pointer to act on.
let pointerLocation: Position | null = null;

export function getWorkspacePointerLocation(): Readonly<Position> | null {
  return pointerLocation;
}

function handlePointerMove(event: MouseEvent): void {
  pointerLocation = { x: event.clientX, y: event.clientY };
}

// Mounted by the canvas, like the reference's `useAddMouseLocationListener`: the location is
// only tracked while a workspace is on screen, and it is forgotten when the canvas unmounts.
export function useWorkspacePointerLocation(): void {
  useEffect(() => {
    window.addEventListener("mousemove", handlePointerMove);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      pointerLocation = null;
    };
  }, []);
}
