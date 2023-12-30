import { dbLoadProject } from "dbRequests/projects";
import { loadProjectState } from "thunks/loadProjectState";
import { ProjectLoadType } from "z_utils/types/projectSaveLoad";

export function loadProjectIntoState({
  projectInfo,
}: {
  projectInfo: ProjectLoadType;
}) {
  console.log("projectInfo", projectInfo);
  loadProjectState({
    ...projectInfo,
  });
  return true;
}

export async function loadProject({ projectName, configName }) {
  const res = await dbLoadProject({
    projectName,
    configName,
  });
  if (res.status === 200) {
    return loadProjectIntoState({ projectInfo: res.data });
  } else {
    return false;
  }
}
