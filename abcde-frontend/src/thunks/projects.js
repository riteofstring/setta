import { loadProject as loadProjectDb } from "dbRequests/projects";
import { loadSections } from "models/master";

export function loadProjectIntoState({ projectInfo, excludeCodeInfo = false }) {
  let { uiTypes, baseUITypes, presetUITypes, ...theRest } = projectInfo;
  uiTypes = { ...uiTypes, ...baseUITypes, ...presetUITypes };
  loadSections({
    uiTypes,
    ...theRest,
    excludeCodeInfo,
  });
  return true;
}

export async function loadProject({ id, configId }) {
  const projectInfo = await loadProjectDb({ id, configId });
  return loadProjectIntoState({ projectInfo });
}
