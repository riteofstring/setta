import type { GpuRetainedContentNavigationTarget } from "gpuFlow/retainedContentKeyboard";
import type { GpuContentSurface, GpuFlowScene } from "gpuFlow/scene";
import { getCurrEffectiveSectionImplWithTypeGuardIfPresent } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

type ProjectGpuRetainedParamSurface = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

export function getProjectGpuRetainedParamNavigationTarget({
  activeSectionIds,
  projectState,
  scene,
}: {
  readonly activeSectionIds: readonly string[];
  readonly projectState: ZustandProjectState;
  readonly scene: GpuFlowScene;
}): GpuRetainedContentNavigationTarget | null {
  const activeSectionRank = new Map(
    activeSectionIds.map((sectionId, index) => [sectionId, index]),
  );
  const surfaces = scene.contentSurfaces
    .map((surface, index) => ({
      activeRank:
        activeSectionRank.get(surface.ownerSectionId) ??
        Number.MAX_SAFE_INTEGER,
      index,
      surface,
    }))
    .filter(
      (
        item,
      ): item is {
        readonly activeRank: number;
        readonly index: number;
        readonly surface: ProjectGpuRetainedParamSurface;
      } => isProjectGpuRetainedParamSurface(item.surface),
    )
    .sort(
      (left, right) =>
        left.activeRank - right.activeRank ||
        right.surface.zIndex - left.surface.zIndex ||
        right.index - left.index,
    );
  for (const { surface } of surfaces) {
    const sectionImpl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
      projectState,
      surface.ownerSectionId,
      isBaseSectionWithParamsImpl,
    );
    const selectedParams = sectionImpl?.selectedParams ?? [];
    if (selectedParams.length === 0) {
      continue;
    }
    const rowIds = new Set(surface.retainedScene.rowOrder);
    for (const selectedParamId of [...selectedParams].reverse()) {
      if (!rowIds.has(selectedParamId)) {
        continue;
      }
      return {
        ownerSectionId: surface.ownerSectionId,
        rowId: selectedParamId,
        surfaceId: surface.id,
      };
    }
  }
  return null;
}

function isProjectGpuRetainedParamSurface(
  surface: GpuContentSurface,
): surface is ProjectGpuRetainedParamSurface {
  return (
    surface.renderer.kind === "canvas-content" && Boolean(surface.retainedScene)
  );
}
