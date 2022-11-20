import { loadAllProjectsMetadata } from "__tests__utils/loadTestData";
import {
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
  console.log("id", id);
  console.log("configId", configId);
  return await loadOneProjectById({ id, configId });
}

export async function noAuthCreateProject({ name }) {}

export async function noAuthSaveProject({ project }) {}
