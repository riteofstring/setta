import type { GpuFlowScene, GpuSectionSceneNode } from "./scene";
import { resolveGpuFlowSectionSceneLayout } from "./sceneLayout";
import type { GpuRect } from "./viewportMath";

export function resolveGpuSectionSceneResizePreviewSections({
  resizedWorldRect,
  scene,
  sectionId,
}: {
  readonly resizedWorldRect: GpuRect;
  readonly scene: GpuFlowScene;
  readonly sectionId: string;
}): readonly GpuSectionSceneNode[] {
  let foundSection = false;
  const resizedSections = scene.sections.map((section) => {
    if (section.sectionId !== sectionId) {
      return section;
    }
    foundSection = true;
    return resizeGpuSectionSceneNodeOuterRect(section, resizedWorldRect);
  });
  if (!foundSection) {
    throw new Error(`Missing resized section scene node ${sectionId}.`);
  }
  return resolveGpuFlowSectionSceneLayout(resizedSections);
}

function resizeGpuSectionSceneNodeOuterRect(
  section: GpuSectionSceneNode,
  resizedWorldRect: GpuRect,
): GpuSectionSceneNode {
  const localRect =
    section.parentSectionId === null
      ? resizedWorldRect
      : {
          ...section.localRect,
          height: resizedWorldRect.height,
          width: resizedWorldRect.width,
        };
  const worldRect =
    section.parentSectionId === null
      ? resizedWorldRect
      : {
          ...section.worldRect,
          height: resizedWorldRect.height,
          width: resizedWorldRect.width,
        };
  return {
    ...section,
    bodyRect: resizeGpuRectRelativeToReference({
      nextReference: worldRect,
      previousReference: section.worldRect,
      rect: section.bodyRect,
    }),
    childViewportRect: section.childViewportRect
      ? resizeGpuRectRelativeToReference({
          nextReference: worldRect,
          previousReference: section.worldRect,
          rect: section.childViewportRect,
        })
      : null,
    chromeRect: resizeGpuRectRelativeToReference({
      nextReference: worldRect,
      previousReference: section.worldRect,
      rect: section.chromeRect,
    }),
    height: resizedWorldRect.height,
    localRect,
    width: resizedWorldRect.width,
    worldRect,
    x: worldRect.x,
    y: worldRect.y,
  };
}

function resizeGpuRectRelativeToReference({
  nextReference,
  previousReference,
  rect,
}: {
  readonly nextReference: GpuRect;
  readonly previousReference: GpuRect;
  readonly rect: GpuRect;
}): GpuRect {
  return {
    height:
      rect.height === previousReference.height
        ? nextReference.height
        : rect.height,
    width:
      rect.width === previousReference.width ? nextReference.width : rect.width,
    x: nextReference.x + (rect.x - previousReference.x),
    y: nextReference.y + (rect.y - previousReference.y),
  };
}
