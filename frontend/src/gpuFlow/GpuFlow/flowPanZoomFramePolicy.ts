type GpuFlowPanZoomInteractionState = {
  readonly panActivationKeyPressed: boolean;
  readonly panScrolling: boolean;
  readonly pointerPanning: boolean;
  readonly wheelZooming: boolean;
};

export function isGpuFlowPanZoomInteractionActive(
  state: GpuFlowPanZoomInteractionState,
): boolean {
  return Boolean(
    state.panActivationKeyPressed ||
      state.pointerPanning ||
      state.wheelZooming ||
      state.panScrolling,
  );
}

export function shouldSkipGpuFlowSourceDomTransformSync({
  panZoomInteractionActive,
  viewportFrame,
}: {
  readonly panZoomInteractionActive: boolean;
  readonly viewportFrame: boolean;
}): boolean {
  return panZoomInteractionActive || viewportFrame;
}
