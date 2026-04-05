import {
  getActiveViewModeTopLevelSections,
  getCurrEffectiveSectionImpl,
  getSectionShouldRender,
  getSectionViewModeVisibility,
  getTopLevelSectionIdsForDisplay,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import type { Position } from "utils/generatedTypes";

export type GraphSubstrateCanaryLayoutSection = {
  sectionId: string;
  position: Position;
  zIndex: number;
  tempZIndex: number;
  width: number | null;
  height: number | null;
  positionAndSizeLocked: boolean;
};

export function resolveActiveViewModeName(
  projectState: Pick<ZustandProjectState, "projectConfig">,
): string | null {
  const activeViewModeId = projectState.projectConfig.activeViewModeId;
  if (!activeViewModeId) {
    return null;
  }
  return projectState.projectConfig.viewModes[activeViewModeId]?.name ?? null;
}

export function shouldUseSettingsGraphSubstrateCanary(
  projectConfigName: string | null | undefined,
  activeViewModeName: string | null | undefined,
): boolean {
  return (
    projectConfigName === "settings" && activeViewModeName === "All Settings"
  );
}

export function selectSettingsGraphSubstrateCanaryLayoutSections(
  projectState: ZustandProjectState,
): Array<GraphSubstrateCanaryLayoutSection> {
  const activeViewModeName = resolveActiveViewModeName(projectState);
  if (
    !shouldUseSettingsGraphSubstrateCanary(
      projectState.projectConfig.name,
      activeViewModeName,
    )
  ) {
    return [];
  }

  const layouts = getActiveViewModeTopLevelSections(projectState);
  const candidates: Array<GraphSubstrateCanaryLayoutSection> = [];

  for (const sectionId of getTopLevelSectionIdsForDisplay(projectState)) {
    const layout = layouts[sectionId];
    if (!layout) {
      continue;
    }
    const { visibility, isEditingViewMode } = getSectionViewModeVisibility(
      sectionId,
      projectState,
    );
    if (!getSectionShouldRender(visibility, isEditingViewMode)) {
      continue;
    }
    const impl = getCurrEffectiveSectionImpl(projectState, sectionId);
    candidates.push({
      sectionId,
      position: { x: layout.x, y: layout.y },
      zIndex: layout.zIndex,
      tempZIndex: layout.zIndex,
      width: layout.w,
      height: layout.h,
      positionAndSizeLocked: impl.positionAndSizeLocked,
    });
  }

  return candidates;
}

export type GraphSubstrateCanarySection = {
  sectionId: string;
  position: Position;
  zIndex: number;
  tempZIndex: number;
  width: number | null;
  height: number | null;
  positionAndSizeLocked: boolean;
};

export function selectSettingsGraphSubstrateCanarySections(
  projectState: ZustandProjectState,
): Array<GraphSubstrateCanarySection> {
  return selectSettingsGraphSubstrateCanaryLayoutSections(projectState).map(
    (layoutSection) => {
      return {
        ...layoutSection,
      };
    },
  );
}
