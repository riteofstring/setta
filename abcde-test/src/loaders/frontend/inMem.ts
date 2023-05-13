import { createNewId } from "abcde-utils/src/utils";
import { PROJECT_STATES } from "../constants";
import { loadGlobalData } from "../loaders";

export const IN_MEM_PROJECT_NAMES = [];
export const IN_MEM_PROJECT_CONFIG_NAMES = {};
const IN_MEM_PROJECTS = {};
const IN_MEM_PROJECT_CONFIGS = {};

export function createInMemProject(name) {
  let project, projectConfig;
  const configName = "config1";
  if (IN_MEM_PROJECT_NAMES.includes(name)) {
    project = IN_MEM_PROJECTS[name];
    projectConfig = IN_MEM_PROJECT_CONFIGS[name][configName];
  } else {
    IN_MEM_PROJECT_NAMES.push(name);
    IN_MEM_PROJECT_CONFIG_NAMES[name] = [configName];

    const fakeId = createNewId();

    project = {
      id: fakeId,
      name,
    };

    projectConfig = {
      id: fakeId,
      name: configName,
      sectionConfigCol: fakeId,
      childrenId: fakeId,
      children: [],
      isDefault: true,
    };

    IN_MEM_PROJECTS[name] = project;
    IN_MEM_PROJECT_CONFIGS[name] = { [configName]: projectConfig };
  }

  return { ...project, configs: [projectConfig] };
}

export async function loadInMemProject({ projectName, configName }) {
  const project = IN_MEM_PROJECTS[projectName];
  const projectConfig = IN_MEM_PROJECT_CONFIGS[projectName][configName];
  const loaded = { project, projectConfig };
  Object.assign(loaded, await loadGlobalData());
  Object.assign(loaded, loadProjectSpecificDataInMem());
  return loaded;
}

function loadProjectSpecificDataInMem() {
  const output = {};
  for (const k of PROJECT_STATES) {
    output[k] = {};
  }
  return output;
}
