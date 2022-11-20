import { loadAllProjectsMetadata } from "__tests__utils/loadTestData";
import {
  createInMemProject,
  loadOneProject,
  loadOneProjectById,
} from "__tests__utils/loadTestData.mjs";

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
