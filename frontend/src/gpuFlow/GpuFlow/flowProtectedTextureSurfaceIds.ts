import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";

export function getGpuFlowCommittedSurfaceProtectedTextureSurfaceIds(
  frame: GpuFlowCommittedSurfaceFrame | void,
): readonly string[] {
  const transaction = frame?.surfaceTransaction;
  if (!transaction) {
    return Object.freeze([]);
  }
  return Object.freeze(
    [
      ...new Set(
        transaction.protectedResourceHandles
          .filter((handle) => handle.kind === "texture")
          .map((handle) => handle.id),
      ),
    ].sort((left, right) => left.localeCompare(right)),
  );
}
