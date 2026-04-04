import type { Node } from "forks/xyflow/core/types";
import {
  getActiveViewModeTopLevelSections,
  getCurrEffectiveSectionImpl,
  getSectionShouldRender,
  getSectionViewModeVisibility,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import type { Position } from "utils/generatedTypes";

type TopLevelLayout = {
  x: number;
  y: number;
  zIndex: number;
  w: number | null;
  h: number | null;
};

export type GraphSubstrateCanaryLayoutSection = {
  sectionId: string;
  position: Position;
  zIndex: number;
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

  for (const [sectionId, layout] of Object.entries(layouts)) {
    if (!(sectionId in projectState.sections)) {
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
      width: layout.w,
      height: layout.h,
      positionAndSizeLocked: impl.positionAndSizeLocked,
    });
  }

  candidates.sort((a, b) => {
    if (a.position.y !== b.position.y) {
      return a.position.y - b.position.y;
    }
    if (a.position.x !== b.position.x) {
      return a.position.x - b.position.x;
    }
    return a.sectionId.localeCompare(b.sectionId);
  });

  return candidates;
}

export type GraphSubstrateCanarySection = {
  sectionId: string;
  position: Position;
  zIndex: number;
  width: number | null;
  height: number | null;
  positionAndSizeLocked: boolean;
};

export function selectSettingsGraphSubstrateCanarySections(
  projectState: ZustandProjectState,
  nodeInternals: Map<string, Node>,
): Array<GraphSubstrateCanarySection> {
  return selectSettingsGraphSubstrateCanaryLayoutSections(projectState).map(
    (layoutSection) => {
      const node = nodeInternals.get(layoutSection.sectionId);
      return {
        ...layoutSection,
        width: node?.width ?? layoutSection.width,
        height: node?.height ?? layoutSection.height,
      };
    },
  );
}
