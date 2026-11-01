import { getReactFlowStore } from "../../canvas/store.js";
import type { WorkspaceHost } from "../../workspaceHost.js";
import type { Transform } from "./types.js";

function getZoomScale(host: WorkspaceHost): number {
  return getReactFlowStore(host).getState().transform[2];
}

export function applyZoomToTransform(
  host: WorkspaceHost,
  transform: Transform | null,
): Transform | null {
  if (!transform) {
    return null;
  }

  const zoom = getZoomScale(host);
  return {
    ...transform,
    x: transform.x / zoom,
    y: transform.y / zoom,
  };
}

export function transformToString(transform: Transform | null): string {
  if (!transform) {
    return "";
  }

  const { x, y, scaleX, scaleY } = transform;
  const translate = `translate3d(${x}px, ${y}px, 0)`;

  if (scaleX === 1 && scaleY === 1) {
    return translate;
  }

  return `${translate} scaleX(${scaleX}) scaleY(${scaleY})`;
}
