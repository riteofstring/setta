import { updateNodeDimensions } from "state/actions/nodeInternals";

export type GpuNodeDimensionSyncState = {
  element: HTMLElement | null;
  frameId: number | null;
};

type GpuNodeDimensionSyncOptions = {
  cancelFrame?: ((frameId: number) => void) | undefined;
  requestFrame?: ((callback: FrameRequestCallback) => number) | undefined;
  updateDimensions?: typeof updateNodeDimensions | undefined;
};

export function scheduleGpuNodeDimensionSync({
  element,
  sectionId,
  syncState,
  options = {},
}: {
  element: HTMLElement | null | undefined;
  sectionId: string;
  syncState: GpuNodeDimensionSyncState;
  options?: GpuNodeDimensionSyncOptions | undefined;
}) {
  if (!element) {
    return;
  }
  syncState.element = element;
  if (syncState.frameId !== null) {
    return;
  }
  const requestFrame = options.requestFrame ?? globalThis.requestAnimationFrame;
  if (typeof requestFrame !== "function") {
    flushGpuNodeDimensionSync({ sectionId, syncState, options });
    return;
  }
  syncState.frameId = requestFrame(() => {
    syncState.frameId = null;
    flushGpuNodeDimensionSync({ sectionId, syncState, options });
  });
}

export function flushGpuNodeDimensionSync({
  element,
  sectionId,
  syncState,
  options = {},
}: {
  element?: HTMLElement | null | undefined;
  sectionId: string;
  syncState: GpuNodeDimensionSyncState;
  options?: GpuNodeDimensionSyncOptions | undefined;
}) {
  if (syncState.frameId !== null) {
    const cancelFrame = options.cancelFrame ?? globalThis.cancelAnimationFrame;
    if (typeof cancelFrame === "function") {
      cancelFrame(syncState.frameId);
    }
    syncState.frameId = null;
  }
  const nodeElement = element ?? syncState.element;
  syncState.element = null;
  if (!nodeElement) {
    return;
  }
  const updateDimensions = options.updateDimensions ?? updateNodeDimensions;
  updateDimensions([{ id: sectionId, nodeElement, forceUpdate: true }]);
}

export function cancelGpuNodeDimensionSync({
  syncState,
  options = {},
}: {
  syncState: GpuNodeDimensionSyncState;
  options?: Pick<GpuNodeDimensionSyncOptions, "cancelFrame"> | undefined;
}) {
  if (syncState.frameId !== null) {
    const cancelFrame = options.cancelFrame ?? globalThis.cancelAnimationFrame;
    if (typeof cancelFrame === "function") {
      cancelFrame(syncState.frameId);
    }
  }
  syncState.frameId = null;
  syncState.element = null;
}
