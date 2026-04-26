type GpuNodeZIndexInput = {
  readonly tempZIndex?: number | undefined;
  readonly zIndex?: number | undefined;
};

export function resolveGpuNodeCssZIndex(
  node: GpuNodeZIndexInput,
): number | undefined {
  return (
    normalizeGpuNodeZIndex(node.tempZIndex) ??
    normalizeGpuNodeZIndex(node.zIndex)
  );
}

export function resolveGpuNodeZIndex(node: GpuNodeZIndexInput): number {
  return resolveGpuNodeCssZIndex(node) ?? 0;
}

function normalizeGpuNodeZIndex(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
