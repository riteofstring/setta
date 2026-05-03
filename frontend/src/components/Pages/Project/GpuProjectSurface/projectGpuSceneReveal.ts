import type { GpuFlowScene, GpuSectionSceneNode } from "gpuFlow/scene";
import {
  resolveGpuSectionSceneRevealRect,
  type GpuSectionSceneRevealRectAlignment,
  type GpuSectionSceneRevealRectResult,
  type GpuSectionSceneScrollOffsetMap,
} from "gpuFlow/sceneScroll";

export type ProjectGpuSceneRevealSectionOptions = {
  readonly align?: GpuSectionSceneRevealRectAlignment | undefined;
  readonly marginPx?: number | undefined;
};

export function resolveProjectGpuSceneSectionReveal({
  align,
  marginPx,
  scene,
  scrollOffsets,
  sectionId,
}: ProjectGpuSceneRevealSectionOptions & {
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuSectionSceneScrollOffsetMap;
  readonly sectionId: string;
}): GpuSectionSceneRevealRectResult {
  const section = getProjectGpuSceneSectionById(scene, sectionId);
  return resolveGpuSectionSceneRevealRect({
    align,
    marginPx,
    parentSectionId: section.parentSectionId,
    rect: section.localRect,
    scene,
    scrollOffsets,
  });
}

function getProjectGpuSceneSectionById(
  scene: GpuFlowScene,
  sectionId: string,
): GpuSectionSceneNode {
  const section = scene.sections.find(
    (candidate) => candidate.sectionId === sectionId,
  );
  if (!section) {
    throw new Error(`Missing project GPU scene section ${sectionId}.`);
  }
  return section;
}
