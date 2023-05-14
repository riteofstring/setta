import { createNewId } from "abcde-utils/src/utils";

export const IN_MEM_PROJECT_NAMES: string[] = [];
export const IN_MEM_PROJECT_CONFIG_NAMES = {};
export const IN_MEM_PROJECTS = {};
export const IN_MEM_PROJECT_CONFIGS = {};

export function createInMemProject(name: string) {
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
