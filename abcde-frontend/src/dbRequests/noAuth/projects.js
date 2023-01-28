import {
  createInMemProject,
  loadAllProjectsMetadata,
  loadOneProject,
  loadOneProjectById,
} from "abcde-test/src/loadTestData";

export async function noAuthGetProjects() {
  return await loadAllProjectsMetadata();
}

export async function noAuthLoadProject({ id, configId }) {
  if (!id) {
    return await loadOneProject({});
  }
  return await loadOneProjectById({ id, configId });
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
