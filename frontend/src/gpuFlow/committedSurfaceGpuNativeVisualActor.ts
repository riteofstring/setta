import { freezeActor } from "./committedSurfaceActorFreeze";
import type { GpuFlowCommittedSurfaceActorGeneration } from "./committedSurfaceFrame";
import type { HtmlSurfaceSolidRoundedRectVisual } from "./htmlSurfaces/visualScene";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuRect } from "./viewportMath";

export function createGpuNativeVisualActors({
  retainedRuntimeFrame,
  visuals,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly visuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
}): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  return Object.freeze(
    visuals.map((visual, index) =>
      gpuNativeVisualToActor({
        index,
        retainedRuntimeFrame,
        visual,
      }),
    ),
  );
}

function gpuNativeVisualToActor({
  index,
  retainedRuntimeFrame,
  visual,
}: {
  readonly index: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly visual: HtmlSurfaceSolidRoundedRectVisual;
}): GpuFlowCommittedSurfaceActorGeneration {
  const retainedScrollRevision = getGpuFlowCommittedSurfaceActorScrollRevision({
    retainedRuntimeFrame,
    surfaceId: visual.surfaceId,
  });
  const contentGenerationId = [
    "gpu-native-visual-content",
    visual.surfaceId,
    visual.radius,
    colorKey(visual.color),
  ].join("|");
  const layoutProjectionGenerationId = [
    "gpu-native-visual-layout",
    visual.surfaceId,
    index,
    rectKey(visual.rect),
    retainedScrollRevision,
    visual.zIndex,
  ].join("|");
  return freezeActor({
    active: false,
    actorId: `${visual.surfaceId}:native-visual:${index}`,
    clipChainRevision: visual.surfaceId,
    clipRect: visual.rect,
    contentGenerationId,
    controlId: null,
    focusIdentity: null,
    flowRect: visual.rect,
    generationId: [
      contentGenerationId,
      layoutProjectionGenerationId,
      "ready",
    ].join("|"),
    islandId: null,
    kind: "gpu-native-visual",
    layoutProjectionGenerationId,
    liveMotionSampleId: "not-sampled",
    mountReadiness: "not-required",
    ownerSurfaceId: visual.surfaceId,
    pointerEvents: "none",
    projectionReadiness: "not-required",
    readinessGenerationId: "ready",
    retainedScrollOffset: null,
    retainedScrollRevision,
    rowId: null,
    sourceRect: visual.rect,
    valueStyleRevision: [visual.radius, colorKey(visual.color)].join("|"),
    visibleNonempty: false,
    wheelPolicy: "none",
    zOrder: visual.zIndex,
  });
}

export function getGpuFlowCommittedSurfaceActorScrollRevision({
  retainedRuntimeFrame,
  surfaceId,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly surfaceId: string;
}): number {
  return (
    retainedRuntimeFrame.input.scrollRevisions.get(surfaceId) ??
    retainedRuntimeFrame.input.scrollRevision
  );
}

export function rectKey(rect: GpuRect): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

function colorKey(color: HtmlSurfaceSolidRoundedRectVisual["color"]): string {
  return `${color.r},${color.g},${color.b},${color.a}`;
}
