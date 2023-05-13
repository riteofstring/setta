import { loadGlobalData, loadProjectSpecificData } from "../loaders";
import { PROJECT_CONFIG_NAMES, PROJECT_NAMES } from "../constants";

const IN_MEM_PROJECTS = {};
const IN_MEM_PROJECT_CONFIGS = {};

export function createInMemProject(name) {
  const configName = "config1";

  PROJECT_NAMES["inMem"].push(name);
  PROJECT_CONFIG_NAMES[name] = [configName];
  const fakeId = "12345";

  const project = {
    id: fakeId,
    name,
  };

  const projectConfig = {
    id: fakeId,
    name: configName,
    sectionConfigCol: fakeId,
    childrenId: fakeId,
    children: [],
    isDefault: true,
  };

  IN_MEM_PROJECTS[name] = project;
  IN_MEM_PROJECT_CONFIGS[name] = { [configName]: projectConfig };

  return { ...project, configs: [projectConfig] };
}

export async function loadInMemProject({ projectName, configName }) {
  const project = IN_MEM_PROJECTS[projectName];
  const projectConfig = IN_MEM_PROJECT_CONFIGS[projectName][configName];
  const loaded = { project, projectConfig };
  Object.assign(loaded, await loadGlobalData());
  Object.assign(
    loaded,
    await loadProjectSpecificData({
      projectName,
      subFolderName: configName,
      type: "inMem",
    })
  );
  return loaded;
}
