import { BrowserWindow } from "electron";
import type { IpcMainInvokeEvent, Rectangle } from "electron";

import type { RendererRegionCaptureRequest, RendererRegionSnapshot } from "@shared/types";

export async function captureRendererRegion(
  event: IpcMainInvokeEvent,
  request: RendererRegionCaptureRequest,
): Promise<RendererRegionSnapshot> {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  if (!ownerWindow) {
    throw new Error("renderer capture request has no owning BrowserWindow");
  }
  const rect = rendererCaptureRectangle(request);
  const image = await capturePageOrFallback(ownerWindow, rect);
  return {
    capturedAt: Date.now(),
    height: rect.height,
    imageDataUrl: image.toDataURL(),
    width: rect.width,
  };
}

async function capturePageOrFallback(ownerWindow: BrowserWindow, rect: Rectangle) {
  try {
    return await ownerWindow.webContents.capturePage(rect);
  } catch (error) {
    if (isUnknownVizCaptureError(error)) {
      return emptyNativeImage();
    }
    throw error;
  }
}

function isUnknownVizCaptureError(error: unknown): boolean {
  return error instanceof Error && error.message === "UnknownVizError";
}

function emptyNativeImage() {
  return {
    toDataURL: () => transparentPixelDataUrl,
  };
}

const transparentPixelDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function rendererCaptureRectangle(request: RendererRegionCaptureRequest): Rectangle {
  const rect = {
    height: Math.round(request.height),
    width: Math.round(request.width),
    x: Math.round(request.x),
    y: Math.round(request.y),
  };
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new Error(`invalid renderer capture rectangle ${JSON.stringify(request)}`);
  }
  return rect;
}
