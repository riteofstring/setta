import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";

export function createGpuFlowRetainedRuntimeFrameSourceRenderSignature(
  frame: GpuRetainedRuntimeFrame,
): string {
  return JSON.stringify({
    // Retained scroll offsets are applied by projection; source render work only
    // changes when the host identity, geometry, or value styling changes.
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
