import type { Node } from "forks/xyflow/core/types";
import {
  getActiveViewModeTopLevelSections,
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

export type GraphSubstrateCanarySection = {
  sectionId: string;
  position: Position;
  zIndex: number;
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
  preferredSectionId: string | null = null,
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
    const node = nodeInternals.get(sectionId);

    candidates.push({
      sectionId,
      position: node?.position ?? { x: layout.x, y: layout.y },
      zIndex: node?.zIndex ?? layout.zIndex,
      width: node?.width ?? layout.w,
      height: node?.height ?? layout.h,
    });
  }

  if (preferredSectionId) {
    const preferredCandidate =
      candidates.find((candidate) => candidate.sectionId === preferredSectionId) ??
      null;
    if (preferredCandidate) {
      return preferredCandidate;
    }
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

  return candidates[0] ?? null;
}
