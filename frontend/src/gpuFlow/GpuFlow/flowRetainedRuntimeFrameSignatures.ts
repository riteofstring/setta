import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";

export function createGpuFlowRetainedRuntimeFrameSourceRenderSignature(
  frame: GpuRetainedRuntimeFrame,
): string {
  return JSON.stringify({
    textLikeSnapshotSources: frame.descriptors.textLikeRowSnapshotSources.map(
      (source) => ({
        sourceId: source.sourceId,
        sourceKey: source.sourceKey,
      }),
    ),
  });
}

export function createGpuFlowRetainedRuntimeFrameOverlayRenderSignature(
  frame: GpuRetainedRuntimeFrame,
): string {
  return JSON.stringify({
    nativeDomIslands: frame.descriptors.nativeDomIslands.map((island) => ({
      id: island.id,
      kind: island.kind,
      rect: island.rect,
      source: island.source,
      zIndex: island.zIndex,
    })),
  });
}

export function resolveOverlayRetainedRuntimeFrame({
  initialRetainedRuntimeFrame,
  retainedRuntimeFrame,
}: {
  readonly initialRetainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
}): GpuRetainedRuntimeFrame {
  return retainedRuntimeFrame ?? initialRetainedRuntimeFrame;
}

export function resolveSourceRetainedRuntimeFrame({
  overlayRetainedRuntimeFrame,
  retainedPreparationRuntimeFrame,
}: {
  readonly overlayRetainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly retainedPreparationRuntimeFrame: GpuRetainedRuntimeFrame | null;
}): GpuRetainedRuntimeFrame {
  return retainedPreparationRuntimeFrame ?? overlayRetainedRuntimeFrame;
}
