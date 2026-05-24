import type { GpuFlowPreparedContentFramePresentationFramePlanPreparation } from "./visibleFrameContentPlan";

export function prepareGpuFlowPreparedContentFrameOverlayTexturesForPresentationCandidate<
  OverlayTextureInput,
  OverlayTextureResult,
>({
  input,
  prepareOverlayTextures,
  presentationPreparation,
}: {
  readonly input: OverlayTextureInput;
  readonly prepareOverlayTextures: (
    input: OverlayTextureInput,
  ) => OverlayTextureResult;
  readonly presentationPreparation: Pick<
    GpuFlowPreparedContentFramePresentationFramePlanPreparation,
    "shouldPrepareHtmlSurfaceOverlayTextures"
  >;
}): OverlayTextureResult | undefined {
  if (!presentationPreparation.shouldPrepareHtmlSurfaceOverlayTextures) {
    return;
  }
  return prepareOverlayTextures(input);
}
