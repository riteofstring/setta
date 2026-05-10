export function destroyGpuBuffers(buffers: readonly (GPUBuffer | null)[]) {
  for (const buffer of buffers) {
    buffer?.destroy?.();
  }
}
