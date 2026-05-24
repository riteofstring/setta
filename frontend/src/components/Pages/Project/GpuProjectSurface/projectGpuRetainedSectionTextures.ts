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
    const textureContentKey = createProjectGpuRetainedSectionTextureKey({
      scene,
      sectionId: section.sectionId,
    });
    if (
      section.textureCssHeight === undefined &&
      section.textureCssWidth === undefined &&
      section.textureContentKey === textureContentKey
    ) {
      return section;
    }
    const baseSection = omitProjectGpuRetainedSectionTextureDimensions(section);
    changed = true;
    return {
      ...baseSection,
      textureContentKey,
    };
  });
  return changed ? { ...scene, sections } : scene;
}

function omitProjectGpuRetainedSectionTextureDimensions(
  section: GpuFlowScene["sections"][number],
) {
  const { textureCssHeight, textureCssWidth, ...baseSection } = section;
  void textureCssHeight;
  void textureCssWidth;
  return baseSection;
}

function createProjectGpuRetainedSectionTextureKey({
  scene,
  sectionId,
}: {
  readonly scene: GpuFlowScene;
  readonly sectionId: string;
}): string {
  return `project-retained-section-shell:v2:${sectionId}:${scene.revision}`;
}
