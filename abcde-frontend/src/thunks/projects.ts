import { ProjectLoadType } from "abcde-utils/src/types/projectSaveLoad";
import { loadProject as loadProjectDb } from "dbRequests/projects";
import { loadSections } from "models/master";

export function loadProjectIntoState({
  projectInfo,
  excludeCodeInfo = false,
}: {
  projectInfo: ProjectLoadType;
  excludeCodeInfo?: boolean;
}) {
  loadSections({
    ...projectInfo,
    excludeCodeInfo,
  });
  return true;
}

export async function loadProject({ projectName, configName }) {
  const projectInfo = await loadProjectDb({ projectName, configName });
  if (projectInfo) {
    return loadProjectIntoState({ projectInfo });
  }
  return false;
}
