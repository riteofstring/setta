import { ProjectLoadType } from "abcde-utils/src/types/projectSaveLoad";
import { dbLoadProject } from "dbRequests/projects";
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
  try {
    const res = await dbLoadProject({
      username,
      projectName,
      configName,
    });
    return loadProjectIntoState({ projectInfo: res.data });
  } catch (error) {
    return false;
  }
}
