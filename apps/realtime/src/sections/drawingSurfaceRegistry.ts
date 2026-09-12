import type { WorkspaceHost } from "@setta/workspace";

import type { DrawingCanvasResizeRequest } from "./drawingRuntime";

type DrawingSurfaceController = {
  fitSectionToCanvas: () => boolean;
  getCanvasSize: () => { height: number; width: number };
  resizeCanvas: (request: DrawingCanvasResizeRequest) => boolean;
};

const drawingSurfacesByHost = new WeakMap<
  WorkspaceHost,
  Map<string, DrawingSurfaceController>
>();

function getDrawingSurfaces(
  host: WorkspaceHost,
): Map<string, DrawingSurfaceController> {
  const existing = drawingSurfacesByHost.get(host);
  if (existing !== undefined) {
    return existing;
  }
  const surfaces = new Map<string, DrawingSurfaceController>();
  drawingSurfacesByHost.set(host, surfaces);
  return surfaces;
}

export function registerDrawingSurface(
  host: WorkspaceHost,
  sectionId: string,
  controller: DrawingSurfaceController,
): () => void {
  const surfaces = getDrawingSurfaces(host);
  surfaces.set(sectionId, controller);
  return () => {
    if (surfaces.get(sectionId) === controller) {
      surfaces.delete(sectionId);
    }
  };
}

export function getDrawingCanvasSize(
  host: WorkspaceHost,
  sectionId: string,
): { height: number; width: number } | null {
  return (
    drawingSurfacesByHost.get(host)?.get(sectionId)?.getCanvasSize() ?? null
  );
}

export function resizeDrawingCanvas(
  host: WorkspaceHost,
  sectionId: string,
  request: DrawingCanvasResizeRequest,
): boolean {
  return (
    drawingSurfacesByHost.get(host)?.get(sectionId)?.resizeCanvas(request) ??
    false
  );
}

export function fitDrawingSectionToCanvas(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return (
    drawingSurfacesByHost.get(host)?.get(sectionId)?.fitSectionToCanvas() ??
    false
  );
}
