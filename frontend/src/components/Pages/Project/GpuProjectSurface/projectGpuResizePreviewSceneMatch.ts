import type { GpuRetainedContentScene } from "gpuFlow/retainedContentScene";
import type {
  GpuContentSurface,
  GpuDomIsland,
  GpuFlowScene,
  GpuSectionSceneNode,
} from "gpuFlow/scene";
import type { GpuRect } from "gpuFlow/viewportMath";

export function projectGpuResizePreviewSceneMatchesCommittedScene(
  previewScene: GpuFlowScene,
  committedScene: GpuFlowScene,
): boolean {
  return (
    projectGpuSectionGeometryMatches(previewScene, committedScene) &&
    projectGpuContentSurfaceGeometryMatches(previewScene, committedScene) &&
    projectGpuDomIslandGeometryMatches(previewScene, committedScene)
  );
}

function projectGpuSectionGeometryMatches(
  previewScene: GpuFlowScene,
  committedScene: GpuFlowScene,
): boolean {
  if (previewScene.sections.length !== committedScene.sections.length) {
    return false;
  }
  const committedSectionById = new Map(
    committedScene.sections.map((section) => [section.sectionId, section]),
  );
  return previewScene.sections.every((previewSection) => {
    const committedSection = committedSectionById.get(previewSection.sectionId);
    return Boolean(
      committedSection &&
        projectGpuSectionRecordGeometryMatches(
          previewSection,
          committedSection,
        ),
    );
  });
}

function projectGpuSectionRecordGeometryMatches(
  previewSection: GpuSectionSceneNode,
  committedSection: GpuSectionSceneNode,
): boolean {
  return (
    gpuRectsEqual(previewSection.bodyRect, committedSection.bodyRect) &&
    gpuRectsEqual(previewSection.chromeRect, committedSection.chromeRect) &&
    gpuRectsEqual(previewSection.clipRect, committedSection.clipRect) &&
    gpuRectsEqual(previewSection.localRect, committedSection.localRect) &&
    gpuRectsEqual(previewSection.worldRect, committedSection.worldRect)
  );
}

function projectGpuContentSurfaceGeometryMatches(
  previewScene: GpuFlowScene,
  committedScene: GpuFlowScene,
): boolean {
  if (
    previewScene.contentSurfaces.length !==
    committedScene.contentSurfaces.length
  ) {
    return false;
  }
  const committedSurfaceById = new Map(
    committedScene.contentSurfaces.map((surface) => [surface.id, surface]),
  );
  return previewScene.contentSurfaces.every((previewSurface) => {
    const committedSurface = committedSurfaceById.get(previewSurface.id);
    return Boolean(
      committedSurface &&
        projectGpuContentSurfaceRecordGeometryMatches(
          previewSurface,
          committedSurface,
        ),
    );
  });
}

function projectGpuContentSurfaceRecordGeometryMatches(
  previewSurface: GpuContentSurface,
  committedSurface: GpuContentSurface,
): boolean {
  return (
    previewSurface.ownerSectionId === committedSurface.ownerSectionId &&
    gpuRectsEqual(previewSurface.clipRect, committedSurface.clipRect) &&
    gpuRectsEqual(previewSurface.rect, committedSurface.rect) &&
    projectGpuRetainedSceneGeometryMatches(
      previewSurface.retainedScene,
      committedSurface.retainedScene,
    )
  );
}

function projectGpuRetainedSceneGeometryMatches(
  previewScene: GpuRetainedContentScene | undefined,
  committedScene: GpuRetainedContentScene | undefined,
): boolean {
  if (Boolean(previewScene) !== Boolean(committedScene)) {
    return false;
  }
  if (!previewScene || !committedScene) {
    return true;
  }
  return (
    gpuRectsEqual(previewScene.contentRect, committedScene.contentRect) &&
    gpuRectsEqual(previewScene.viewportRect, committedScene.viewportRect)
  );
}

function projectGpuDomIslandGeometryMatches(
  previewScene: GpuFlowScene,
  committedScene: GpuFlowScene,
): boolean {
  if (previewScene.domIslands.length !== committedScene.domIslands.length) {
    return false;
  }
  const committedIslandById = new Map(
    committedScene.domIslands.map((island) => [island.id, island]),
  );
  return previewScene.domIslands.every((previewIsland) => {
    const committedIsland = committedIslandById.get(previewIsland.id);
    return Boolean(
      committedIsland &&
        projectGpuDomIslandRecordGeometryMatches(
          previewIsland,
          committedIsland,
        ),
    );
  });
}

function projectGpuDomIslandRecordGeometryMatches(
  previewIsland: GpuDomIsland,
  committedIsland: GpuDomIsland,
): boolean {
  return (
    previewIsland.clipOwnerId === committedIsland.clipOwnerId &&
    previewIsland.ownerSectionId === committedIsland.ownerSectionId &&
    gpuRectsEqual(previewIsland.contentRect, committedIsland.contentRect) &&
    gpuRectsEqual(previewIsland.rect, committedIsland.rect)
  );
}

function gpuRectsEqual(left: GpuRect, right: GpuRect): boolean {
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}
