import type {
  GetLatestProjectStateResponse,
  ProjectviewSingleConfig,
} from "openapi/http";

import { createChromeReproPerfTimer } from "state/actions/chromeRepro";

export function createProjectStateUpdateChromeReproTimer(
  update: GetLatestProjectStateResponse,
) {
  return createChromeReproPerfTimer("project-state-update", {
    completedOpCount: countNullableArrayItems(update.completedOpIds),
    incomingProjectConfigId: update.projectState.projectConfig.id,
    pendingOpCount: countNullableArrayItems(update.pendingOpIds),
    ...summarizeProjectStateForChromeRepro(update.projectState),
  });
}

function summarizeProjectStateForChromeRepro(
  projectState: ProjectviewSingleConfig,
): Record<string, unknown> {
  const { projectConfig } = projectState;
  return {
    activeSectionCount: countNullableArrayItems(projectConfig.activeIds),
    activeViewModeId: projectConfig.activeViewModeId ?? null,
    codeObjCount: countRecordKeys(projectState.codeObjs),
    codeObjImplCount: countRecordKeys(projectState.codeObjImpls),
    codeObjVariantCount: countRecordKeys(projectState.codeObjVariants),
    projectChatWindowCount: countRecordKeys(
      projectState.projectChatWindowing?.instancesById,
    ),
    sectionCount: countRecordKeys(projectState.sections),
    sectionImplCount: countRecordKeys(projectState.sectionImpls),
    sectionVariantCount: countRecordKeys(projectState.sectionVariants),
    shownParamVariantCount: countRecordKeys(projectState.shownParamIds),
    topLevelSectionCount: countRecordKeys(projectConfig.topLevelSections),
    viewModeCount: countRecordKeys(projectConfig.viewModes),
    windowSpaceCount: countRecordKeys(projectConfig.windowSpaces),
  };
}

function countNullableArrayItems(value: ReadonlyArray<unknown> | null): number {
  return value?.length ?? 0;
}

function countRecordKeys(value: Record<string, unknown> | undefined): number {
  return value === undefined ? 0 : Object.keys(value).length;
}
