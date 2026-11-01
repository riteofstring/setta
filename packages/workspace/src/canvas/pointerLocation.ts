import { useEffect } from "react";
import type { Position } from "../document/types.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import type { WorkspaceHost } from "../workspaceHost.js";

const pointerLocationsByHost = new WeakMap<WorkspaceHost, Position | null>();

export function getWorkspacePointerLocation(
  host: WorkspaceHost,
): Readonly<Position> | null {
  return pointerLocationsByHost.get(host) ?? null;
}

function handlePointerMove(host: WorkspaceHost, event: MouseEvent): void {
  pointerLocationsByHost.set(host, { x: event.clientX, y: event.clientY });
}

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
