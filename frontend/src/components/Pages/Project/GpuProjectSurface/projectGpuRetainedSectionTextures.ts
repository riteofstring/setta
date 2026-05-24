import type { GpuFlowScene } from "gpuFlow/scene";

export function getProjectRetainedContentSectionIds(
  scene: GpuFlowScene,
): ReadonlySet<string> {
  return new Set(
    scene.contentSurfaces.flatMap((surface) =>
      surface.renderer.kind === "canvas-content" && surface.retainedScene
        ? [surface.ownerSectionId]
        : [],
    ),
  );
}

export function createProjectGpuRetainedSectionTextureScene(
  scene: GpuFlowScene,
): GpuFlowScene {
  const retainedContentSectionIds = getProjectRetainedContentSectionIds(scene);
  if (retainedContentSectionIds.size === 0) {
    return scene;
  }
  let changed = false;
  const sections = scene.sections.map((section) => {
    if (!retainedContentSectionIds.has(section.sectionId)) {
      return section;
    }
    if (
      section.textureCssHeight === PROJECT_GPU_RETAINED_SECTION_TEXTURE_SIZE &&
      section.textureCssWidth === PROJECT_GPU_RETAINED_SECTION_TEXTURE_SIZE &&
      section.textureContentKey === PROJECT_GPU_RETAINED_SECTION_TEXTURE_KEY
    ) {
      return section;
    }
    changed = true;
    return {
      ...section,
      textureContentKey: PROJECT_GPU_RETAINED_SECTION_TEXTURE_KEY,
      textureCssHeight: PROJECT_GPU_RETAINED_SECTION_TEXTURE_SIZE,
      textureCssWidth: PROJECT_GPU_RETAINED_SECTION_TEXTURE_SIZE,
    };
  });
  return changed ? { ...scene, sections } : scene;
}

const PROJECT_GPU_RETAINED_SECTION_TEXTURE_KEY =
  "project-retained-section-shell:v1";
const PROJECT_GPU_RETAINED_SECTION_TEXTURE_SIZE = 1;
