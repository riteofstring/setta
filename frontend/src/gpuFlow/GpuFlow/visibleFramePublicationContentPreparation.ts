import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type {
  GpuFlowCommittedSurfacePublicationFramePlanPreparation,
  GpuFlowCommittedSurfacePublicationFramePlanPreparer,
} from "./visibleFramePublicationContentPlan";

export type GpuFlowRetainedDisplayCommittedSurfaceFramePreparer = (
  frame: RetainedDisplayFrame,
  options?:
    | {
        readonly gpuNativeVisuals:
          | readonly HtmlSurfaceSolidRoundedRectVisual[]
          | undefined;
      }
    | undefined,
) => GpuFlowCommittedSurfaceFrame | void;

export type GpuFlowPreparedCommittedSurfacePublicationFramePlan = {
  readonly preparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publicationPreparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
};

export function prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay({
  committedGpuNativeVisuals,
  deferBrowserVisualRetry,
  frameReasons,
  heldPreviousProjectionState,
  liveProjectionSample,
  prepareCommittedSurfaceFrame,
  prepareCommittedSurfacePublicationFramePlan,
  publicationLane,
  publishedRetainedFrame,
}: {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly deferBrowserVisualRetry: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly prepareCommittedSurfaceFrame:
    | GpuFlowRetainedDisplayCommittedSurfaceFramePreparer
    | undefined;
  readonly prepareCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanPreparer;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
}): GpuFlowPreparedCommittedSurfacePublicationFramePlan {
  const preparedCommittedSurfaceFrame = prepareCommittedSurfaceFrame?.(
    publishedRetainedFrame,
    {
      gpuNativeVisuals: committedGpuNativeVisuals,
    },
  );
  return Object.freeze({
    preparedCommittedSurfaceFrame,
    publicationPreparation: prepareCommittedSurfacePublicationFramePlan({
      committedGpuNativeVisuals,
      deferBrowserVisualRetry,
      frameReasons,
      heldPreviousProjectionState,
      liveProjectionSample,
      publicationLane,
      publishedCommittedSurfaceFrame: preparedCommittedSurfaceFrame,
      publishedRetainedFrame,
    }),
  });
}

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
