export function requestGpuAnimationFrame(
  callback: FrameRequestCallback,
): number {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    throw new Error("Setta GPU flow requires requestAnimationFrame.");
  }
  return globalThis.requestAnimationFrame(callback);
}

export function cancelGpuAnimationFrame(frameId: number): void {
  if (typeof globalThis.cancelAnimationFrame !== "function") {
    throw new Error("Setta GPU flow requires cancelAnimationFrame.");
  }
  globalThis.cancelAnimationFrame(frameId);
}
