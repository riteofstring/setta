import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";

export function createGpuFlowRetainedRuntimeFrameSourceRenderSignature(
  frame: GpuRetainedRuntimeFrame,
): string {
  return JSON.stringify({
    domControlSources: frame.descriptors.domControlSources.map((source) => ({
      active: source.active,
      activation: source.activation
        ? {
            kind: source.activation.kind,
            x: source.activation.clientPoint.x,
            y: source.activation.clientPoint.y,
          }
        : null,
      clipChainRevision: source.clipChainRevision,
      geometryRevision: source.geometryRevision,
      layerSlot: source.layerSlot,
      lifecycleState: source.lifecycleState,
      sectionScrollRevision: source.sectionScrollRevision,
      sourceId: source.sourceId,
      sourceKey: source.sourceKey,
      valueStyleRevision: source.valueStyleRevision,
      viewportSampleRevision: source.viewportSampleRevision,
    })),
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
