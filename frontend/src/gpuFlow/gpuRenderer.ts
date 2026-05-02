import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "./animationFrame";
import { GpuFlowSupportError } from "./gpuDevice";

export type GpuFrameReason =
  | "init"
  | "manual"
  | "paint"
  | "resize"
  | "texture-upload"
  | "viewport";

export type GpuFrameEvent = {
  readonly reasons: readonly GpuFrameReason[];
  readonly timestamp: DOMHighResTimeStamp;
};

export type GpuFrameScheduler = {
  cancelFrame(): void;
  destroy(): void;
  isFramePending(): boolean;
  requestFrame(reason?: GpuFrameReason): void;
};

type GpuFrameSchedulerOptions = {
  cancelAnimationFrame?: (handle: number) => void;
  onFrame(event: GpuFrameEvent): void;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
};

export type GpuCanvasSize = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly devicePixelRatio: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
};

type GpuCanvasResizeObserverOptions = {
  ResizeObserver?: typeof ResizeObserver;
  devicePixelRatio?: number;
  notifyUnchanged?: boolean;
};

export function createGpuFrameScheduler(
  options: GpuFrameSchedulerOptions,
): GpuFrameScheduler {
  const requestAnimationFrame =
    options.requestAnimationFrame ?? requestGpuAnimationFrame;
  const cancelAnimationFrame =
    options.cancelAnimationFrame ?? cancelGpuAnimationFrame;
  const pendingReasons = new Set<GpuFrameReason>();
  let frameHandle: number | null = null;
  let destroyed = false;

  return {
    cancelFrame() {
      if (frameHandle === null) {
        return;
      }
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
      pendingReasons.clear();
    },
    destroy() {
      destroyed = true;
      this.cancelFrame();
    },
    isFramePending() {
      return frameHandle !== null;
    },
    requestFrame(reason: GpuFrameReason = "manual") {
      if (destroyed) {
        return;
      }
      pendingReasons.add(reason);
      if (frameHandle !== null) {
        return;
      }
      frameHandle = requestAnimationFrame((timestamp) => {
        frameHandle = null;
        if (destroyed) {
          pendingReasons.clear();
          return;
        }
        const reasons = [...pendingReasons];
        pendingReasons.clear();
        options.onFrame({ reasons, timestamp });
      });
    },
  };
}

export function attachGpuCanvasResizeObserver(
  canvas: HTMLCanvasElement,
  onResize: (size: GpuCanvasSize) => void,
  options: GpuCanvasResizeObserverOptions = {},
): () => void {
  const ResizeObserverCtor =
    options.ResizeObserver ?? globalThis.ResizeObserver;
  if (typeof ResizeObserverCtor !== "function") {
    throw new GpuFlowSupportError("resize-observer-missing");
  }

  const observer = new ResizeObserverCtor((entries) => {
    const entry = entries.find((candidate) => candidate.target === canvas);
    const resizeEntry = entry ?? entries[0];
    if (!resizeEntry) {
      return;
    }
    const size = resolveGpuCanvasSizeFromEntry(
      resizeEntry,
      options.devicePixelRatio,
    );
    const changed = applyGpuCanvasSize(canvas, size);
    if (changed || options.notifyUnchanged) {
      onResize(size);
    }
  });

  observer.observe(canvas, { box: "device-pixel-content-box" });
  return () => observer.disconnect();
}

export function resolveGpuCanvasSizeFromEntry(
  entry: ResizeObserverEntry,
  devicePixelRatio = getDevicePixelRatio(),
): GpuCanvasSize {
  const cssWidth = Math.max(0, entry.contentRect.width);
  const cssHeight = Math.max(0, entry.contentRect.height);
  const devicePixelSize = firstResizeObserverSize(
    entry.devicePixelContentBoxSize,
  );
  if (devicePixelSize) {
    return {
      cssHeight,
      cssWidth,
      devicePixelRatio:
        cssWidth > 0 ? devicePixelSize.inlineSize / cssWidth : devicePixelRatio,
      pixelHeight: Math.max(1, Math.round(devicePixelSize.blockSize)),
      pixelWidth: Math.max(1, Math.round(devicePixelSize.inlineSize)),
    };
  }

  return sizeFromCssPixels(cssWidth, cssHeight, devicePixelRatio);
}

export function measureGpuCanvasClientSize(
  canvas: HTMLCanvasElement,
  devicePixelRatio = getDevicePixelRatio(),
): GpuCanvasSize {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(0, rect.width || canvas.clientWidth);
  const cssHeight = Math.max(0, rect.height || canvas.clientHeight);
  return sizeFromCssPixels(cssWidth, cssHeight, devicePixelRatio);
}

export function applyGpuCanvasSize(
  canvas: HTMLCanvasElement,
  size: GpuCanvasSize,
): boolean {
  const changed =
    canvas.width !== size.pixelWidth || canvas.height !== size.pixelHeight;
  if (changed) {
    canvas.width = size.pixelWidth;
    canvas.height = size.pixelHeight;
  }
  return changed;
}

function sizeFromCssPixels(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): GpuCanvasSize {
  return {
    cssHeight,
    cssWidth,
    devicePixelRatio,
    pixelHeight: Math.max(1, Math.ceil(cssHeight * devicePixelRatio)),
    pixelWidth: Math.max(1, Math.ceil(cssWidth * devicePixelRatio)),
  };
}

function firstResizeObserverSize(
  sizes: readonly ResizeObserverSize[] | undefined,
): ResizeObserverSize | null {
  return sizes?.[0] ?? null;
}

function getDevicePixelRatio(): number {
  return Math.max(1, globalThis.devicePixelRatio || 1);
}
