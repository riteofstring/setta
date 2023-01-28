import {
  createInMemProject,
  loadAllProjectsMetadata,
  loadOneProject,
  loadOneProjectByName,
} from "abcde-test/src/loadTestData";

export async function noAuthGetProjects() {
  return await loadAllProjectsMetadata();
}

export async function noAuthLoadProject({ projectName, configName }) {
  if (!projectName) {
    return await loadOneProject({});
  }
  return await loadOneProjectByName({ projectName, configName });
}

export async function noAuthCreateProject({ name }) {
  return createInMemProject(name);
}

export async function noAuthSaveProject() {
  return true;
}

export async function noAuthSaveAsNewProjectConfig() {
  return true;
}

export async function noAuthSaveAsExistingProjectConfig() {
  return true;
}
