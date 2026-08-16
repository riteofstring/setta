import { useEffect } from "react";
import type { Position } from "../document/types";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { WorkspaceHost } from "../workspaceHost";

// The reference's `forks/xyflow/core/utils/mouseLocation.ts`: the last pointer position the
// canvas observed, in client coordinates, for operations that act where the pointer is instead
// of on a target. The reference seeds it at the origin and acts there before the pointer has
// ever moved; the package leaves it empty so such an operation declines until there is a
// pointer to act on.
const pointerLocationsByHost = new WeakMap<WorkspaceHost, Position | null>();

export function getWorkspacePointerLocation(
  host: WorkspaceHost,
): Readonly<Position> | null {
  return pointerLocationsByHost.get(host) ?? null;
}

function handlePointerMove(host: WorkspaceHost, event: MouseEvent): void {
  pointerLocationsByHost.set(host, { x: event.clientX, y: event.clientY });
}

// Mounted by the canvas, like the reference's `useAddMouseLocationListener`: the location is
// only tracked while a workspace is on screen, and it is forgotten when the canvas unmounts.
export function useWorkspacePointerLocation(): void {
  const host = useWorkspaceHost();
  useEffect(() => {
    const listener = (event: MouseEvent) => handlePointerMove(host, event);
    window.addEventListener("mousemove", listener);
    return () => {
      window.removeEventListener("mousemove", listener);
      pointerLocationsByHost.delete(host);
    };
  }, [host]);
}
