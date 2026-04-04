import type { Node } from "forks/xyflow/core/types";
import {
  getActiveViewModeTopLevelSections,
  getSectionShouldRender,
  getSectionViewModeVisibility,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";

type TopLevelLayout = {
  x: number;
  y: number;
  zIndex: number;
  w: number | null;
  h: number | null;
};

export type GraphSubstrateCanarySection = {
  sectionId: string;
  layout: TopLevelLayout;
  width: number | null;
  height: number | null;
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

export function selectSettingsGraphSubstrateCanarySection(
  projectState: ZustandProjectState,
  nodeInternals: Map<string, Node>,
): GraphSubstrateCanarySection | null {
  const layouts = getActiveViewModeTopLevelSections(projectState);
  const candidates: Array<GraphSubstrateCanarySection> = [];

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

    candidates.push({
      sectionId,
      layout,
      width: nodeInternals.get(sectionId)?.width ?? layout.w,
      height: nodeInternals.get(sectionId)?.height ?? layout.h,
    });
  }

  candidates.sort((a, b) => {
    if (a.layout.y !== b.layout.y) {
      return a.layout.y - b.layout.y;
    }
    if (a.layout.x !== b.layout.x) {
      return a.layout.x - b.layout.x;
    }
    return a.sectionId.localeCompare(b.sectionId);
  });

  return candidates[0] ?? null;
}
