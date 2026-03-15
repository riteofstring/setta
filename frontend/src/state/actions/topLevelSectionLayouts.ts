import { ZustandNodeInternalsState } from "state/definitions";
import { ProjectStateSingleConfig } from "utils/generatedTypes";

export type TopLevelSectionLayoutMap =
  ProjectStateSingleConfig["projectConfig"]["topLevelSections"];

export function getActiveViewModeTopLevelSections(
  projectState: ProjectStateSingleConfig,
): TopLevelSectionLayoutMap {
  const { activeViewModeId, topLevelSections, viewModes } =
    projectState.projectConfig;
  if (!activeViewModeId || !(activeViewModeId in viewModes)) {
    return topLevelSections;
  }
  const viewMode = viewModes[activeViewModeId];
  const viewModeLayout = viewMode.topLevelSections;
  if (!viewModeLayout || Object.keys(viewModeLayout).length === 0) {
    return topLevelSections;
  }
  if (!topLevelSections || Object.keys(topLevelSections).length === 0) {
    return viewModeLayout;
  }
  return { ...topLevelSections, ...viewModeLayout };
}

export function createTopLevelSectionLayoutDict(
  sections: ProjectStateSingleConfig["sections"],
  nodeInternals: ZustandNodeInternalsState["x"],
  existingLayouts: TopLevelSectionLayoutMap | null = null,
): TopLevelSectionLayoutMap {
  const topLevelSections: TopLevelSectionLayoutMap = {};
  if (existingLayouts) {
    for (const [sectionId, layout] of Object.entries(existingLayouts)) {
      if (sectionId in sections) {
        topLevelSections[sectionId] = { ...layout };
      }
    }
  }
  for (const c of nodeInternals.values()) {
    if (c.id in sections) {
      // Some entries can be temporary nodes that should not persist as layouts.
      const existing = topLevelSections[c.id];
      topLevelSections[c.id] = {
        x: c.position.x,
        y: c.position.y,
        zIndex: c.zIndex ?? existing?.zIndex ?? 0,
        w: c.width ?? existing?.w ?? null,
        h: c.height ?? existing?.h ?? null,
      };
    }
  }
  return topLevelSections;
}
