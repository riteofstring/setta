import type { GpuFlowCommittedSurfacePublicationFramePlanPreparation } from "./visibleFrameContentPlan";

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
    GpuFlowCommittedSurfacePublicationFramePlanPreparation,
    "shouldPrepareHtmlSurfaceOverlayTextures"
  >;
}): OverlayTextureResult | undefined {
  if (!publicationPreparation.shouldPrepareHtmlSurfaceOverlayTextures) {
    return;
  }
  return prepareOverlayTextures(input);
}
