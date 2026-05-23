import type { GpuFlowCommittedSurfacePublicationFramePlanPreparation } from "./visibleFrameContentPlan";

export function prepareGpuFlowCommittedSurfaceOverlayTexturesForPublicationCandidate<
  OverlayTextureInput,
>({
  input,
  prepareOverlayTextures,
  publicationPreparation,
}: {
  readonly input: OverlayTextureInput;
  readonly prepareOverlayTextures: (input: OverlayTextureInput) => void;
  readonly publicationPreparation: Pick<
    GpuFlowCommittedSurfacePublicationFramePlanPreparation,
    "shouldPrepareHtmlSurfaceOverlayTextures"
  >;
}): void {
  if (!publicationPreparation.shouldPrepareHtmlSurfaceOverlayTextures) {
    return;
  }
  prepareOverlayTextures(input);
}
