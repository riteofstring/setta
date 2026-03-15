import { getReconciledActiveSectionUIStateFromBackend } from "state/activeSectionBackendSync";
import { type ProjectStateSingleConfig } from "utils/generatedTypes";

export function getNextActiveSectionUIStateFromProjectState(
  projectState: ProjectStateSingleConfig,
  completedOpIds: Array<string>,
) {
  return getReconciledActiveSectionUIStateFromBackend(
    projectState.projectConfig.activeIds,
    completedOpIds,
    projectState.projectConfig.id,
    Object.keys(projectState.sections),
  );
}
