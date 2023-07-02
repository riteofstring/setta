import { ProjectLoadType } from "abcde-utils/src/types/projectSaveLoad";
import { loadProject as loadProjectDb } from "dbRequests/projects";
import { loadProjectState } from "thunks/loadProjectState";

export function loadProjectIntoState({
  projectInfo,
}: {
  projectInfo: ProjectLoadType;
}) {
  loadProjectState({
    ...projectInfo,
  });
  return true;
}

export async function loadProject({ username, projectName, configName }) {
  const projectInfo = await loadProjectDb({
    username,
    projectName,
    configName,
  });
  if (projectInfo) {
    return loadProjectIntoState({ projectInfo });
  }
  return false;
}
