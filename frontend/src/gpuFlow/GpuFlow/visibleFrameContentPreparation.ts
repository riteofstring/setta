import type { GpuFlowPreparedContentFramePublicationFramePlanPreparation } from "./visibleFrameContentPlan";

export function prepareGpuFlowCommittedSurfaceOverlayTexturesForPublicationCandidate<
  OverlayTextureInput,
  OverlayTextureResult,
>({
  input,
  prepareOverlayTextures,
  publicationPreparation,
}: {
  readonly input: OverlayTextureInput;
  readonly prepareOverlayTextures: (
    input: OverlayTextureInput,
  ) => OverlayTextureResult;
  readonly publicationPreparation: Pick<
    GpuFlowPreparedContentFramePublicationFramePlanPreparation,
    "shouldPrepareHtmlSurfaceOverlayTextures"
  >;
}): OverlayTextureResult | undefined {
  if (!publicationPreparation.shouldPrepareHtmlSurfaceOverlayTextures) {
    return;
  }
  return prepareOverlayTextures(input);
}
