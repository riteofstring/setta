import { freezeActor } from "./committedSurfaceActorFreeze";
import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceSectionActorFamily,
} from "./committedSurfaceFrame";
import { rectKey } from "./committedSurfaceGpuNativeVisualActor";
import {
  intersectCommittedSurfaceFrameRects,
  isPositiveCommittedSurfaceRect,
} from "./committedSurfaceRects";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuSectionSceneNode } from "./scene";
import { getVisibleFlowRect, type GpuRect } from "./viewportMath";

export function createSectionStructureActors(
  retainedRuntimeFrame: GpuRetainedRuntimeFrame,
): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  const renderedNodeIds = new Set(
    retainedRuntimeFrame.descriptors.renderedSceneNodeIds,
  );
  const visibleRetainedSectionIds = new Set(
    retainedRuntimeFrame.descriptors.sourceSurfaces.map(
      (surface) => surface.ownerSectionId,
    ),
  );
  return Object.freeze(
    retainedRuntimeFrame.descriptors.sceneSections
      .filter((section) => renderedNodeIds.has(section.sectionId))
      .filter((section) =>
        isSectionStructureActorRequiredForRuntimeFrame({
          section,
          visibleRetainedSectionIds,
        }),
      )
      .flatMap((section) =>
        createSectionStructureActorsForSection({
          retainedRuntimeFrame,
          section,
        }),
      ),
  );
}

function isSectionStructureActorRequiredForRuntimeFrame({
  section,
  visibleRetainedSectionIds,
}: {
  readonly section: GpuSectionSceneNode;
  readonly visibleRetainedSectionIds: ReadonlySet<string>;
}): boolean {
  return (
    section.parentSectionId === null ||
    visibleRetainedSectionIds.has(section.sectionId)
  );
}

function createSectionStructureActorsForSection({
  retainedRuntimeFrame,
  section,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly section: GpuSectionSceneNode;
}): readonly GpuFlowCommittedSurfaceActorGeneration[] {
  if (section.contentRenderer.kind === "scene-only") {
    return [];
  }
  const shellRect = createVisibleSectionActorRect({
    retainedRuntimeFrame,
    sectionRect: intersectCommittedSurfaceFrameRects(
      section.worldRect,
      section.clipRect,
    ),
  });
  if (!isPositiveCommittedSurfaceRect(shellRect)) {
    return [];
  }
  const headerRect = createSectionHeaderActorRect({
    retainedRuntimeFrame,
    section,
  });
  const bodyClipRect = createVisibleSectionActorRect({
    retainedRuntimeFrame,
    sectionRect: intersectCommittedSurfaceFrameRects(
      section.bodyRect,
      section.clipRect,
    ),
  });
  return Object.freeze([
    createSectionStructureActor({
      actorFamily: "section-shell",
      flowRect: shellRect,
      retainedRuntimeFrame,
      section,
      zOrderOffset: 0,
    }),
    ...(headerRect && isPositiveCommittedSurfaceRect(headerRect)
      ? [
          createSectionStructureActor({
            actorFamily: "section-header",
            flowRect: headerRect,
            retainedRuntimeFrame,
            section,
            zOrderOffset: 1,
          }),
        ]
      : []),
    ...(isPositiveCommittedSurfaceRect(bodyClipRect)
      ? [
          createSectionStructureActor({
            actorFamily: "section-body-clip",
            flowRect: bodyClipRect,
            retainedRuntimeFrame,
            section,
            zOrderOffset: 2,
          }),
        ]
      : []),
  ]);
}

function createSectionStructureActor({
  actorFamily,
  flowRect,
  retainedRuntimeFrame,
  section,
  zOrderOffset,
}: {
  readonly actorFamily: GpuFlowCommittedSurfaceSectionActorFamily;
  readonly flowRect: GpuRect;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly section: GpuSectionSceneNode;
  readonly zOrderOffset: number;
}): GpuFlowCommittedSurfaceActorGeneration {
  const ownerSurfaceId = section.sectionId;
  const contentRendererSurfaceId =
    section.contentRenderer.kind === "scene-only"
      ? "scene-only"
      : section.contentRenderer.surfaceId;
  const zOrder = (section.zIndex ?? 0) + zOrderOffset / 1000;
  const sourceRect = createSectionSourceRect({
    flowRect,
    sectionSurfaceRect: section.worldRect,
  });
  const clipChainRevision = [
    "section-clip",
    section.sectionId,
    rectKey(section.clipRect),
  ].join("|");
  const contentGenerationId = [
    `${actorFamily}-content`,
    section.sectionId,
    section.contentRenderer.kind,
    contentRendererSurfaceId,
    section.textureContentKey ?? "content:unknown",
    retainedRuntimeFrame.input.sceneRevision,
  ].join("|");
  const layoutProjectionGenerationId = [
    `${actorFamily}-layout`,
    section.sectionId,
    rectKey(flowRect),
    rectKey(sourceRect),
    clipChainRevision,
    section.width ?? 0,
    section.height ?? 0,
    zOrder,
  ].join("|");
  const readinessGenerationId = `${actorFamily}:ready:${section.sectionId}`;
  const visibleNonempty = !isCompactSectionStructureTexture(section);
  return freezeActor({
    active: false,
    actorFamily,
    actorId: `${section.sectionId}:${actorFamily}`,
    clipChainRevision,
    clipRect: flowRect,
    contentGenerationId,
    controlId: null,
    focusIdentity: null,
    flowRect,
    generationId: [
      contentGenerationId,
      layoutProjectionGenerationId,
      readinessGenerationId,
    ].join("|"),
    islandId: null,
    kind: "html-texture",
    layoutProjectionGenerationId,
    liveMotionSampleId: "not-sampled",
    mountReadiness: "not-required",
    ownerSurfaceId,
    pointerEvents: "none",
    projectionReadiness: "not-required",
    readinessGenerationId,
    retainedScrollOffset: null,
    retainedScrollRevision: 0,
    rowId: null,
    sourceRect,
    valueStyleRevision: null,
    visibleNonempty,
    wheelPolicy: "none",
    zOrder,
  });
}

function isCompactSectionStructureTexture(section: GpuSectionSceneNode): boolean {
  return section.textureCssHeight === 1 && section.textureCssWidth === 1;
}

function createSectionHeaderActorRect({
  retainedRuntimeFrame,
  section,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly section: GpuSectionSceneNode;
}): GpuRect | null {
  const headerHeight = Math.max(0, section.bodyRect.y - section.chromeRect.y);
  if (headerHeight <= 0) {
    return null;
  }
  return createVisibleSectionActorRect({
    retainedRuntimeFrame,
    sectionRect: intersectCommittedSurfaceFrameRects(
      {
        height: headerHeight,
        width: section.chromeRect.width,
        x: section.chromeRect.x,
        y: section.chromeRect.y,
      },
      section.clipRect,
    ),
  });
}

function createVisibleSectionActorRect({
  retainedRuntimeFrame,
  sectionRect,
}: {
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly sectionRect: GpuRect;
}): GpuRect {
  const viewportSize = retainedRuntimeFrame.input.viewportSize;
  if (!viewportSize) {
    return sectionRect;
  }
  return intersectCommittedSurfaceFrameRects(
    sectionRect,
    getVisibleFlowRect({
      canvasHeight: viewportSize.height,
      canvasWidth: viewportSize.width,
      viewport: retainedRuntimeFrame.input.viewport,
    }),
  );
}

function createSectionSourceRect({
  flowRect,
  sectionSurfaceRect,
}: {
  readonly flowRect: GpuRect;
  readonly sectionSurfaceRect: GpuRect;
}): GpuRect {
  return {
    height: flowRect.height,
    width: flowRect.width,
    x: flowRect.x - sectionSurfaceRect.x,
    y: flowRect.y - sectionSurfaceRect.y,
  };
}
