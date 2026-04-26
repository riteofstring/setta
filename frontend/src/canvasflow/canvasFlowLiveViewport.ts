import { CANVAS_FLOW_VIEWPORT_CHANGE_EVENT } from "utils/constants";
import type { CanvasFlowViewport } from "./canvasFlowTypes";
import { canvasFlowViewportsEqual } from "./canvasFlowViewport";

type Listener = () => void;

const listeners = new Set<Listener>();
let currentViewport: CanvasFlowViewport | null = null;

export function publishCanvasFlowLiveViewport(viewport: CanvasFlowViewport) {
  const nextViewport = { ...viewport };
  const changed =
    currentViewport === null ||
    !canvasFlowViewportsEqual(currentViewport, nextViewport);
  currentViewport = nextViewport;
  if (!changed) {
    return;
  }
  for (const listener of listeners) {
    listener();
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CANVAS_FLOW_VIEWPORT_CHANGE_EVENT));
  }
}

export function clearCanvasFlowLiveViewport() {
  if (currentViewport === null) {
    return;
  }
  currentViewport = null;
  for (const listener of listeners) {
    listener();
  }
}

export function getCanvasFlowLiveViewportSnapshot() {
  return currentViewport;
}

export function subscribeCanvasFlowLiveViewport(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
