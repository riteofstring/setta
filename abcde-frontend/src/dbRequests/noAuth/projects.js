import { createInMemProject } from "abcde-test/src/loaders/frontend/inMem";
import {
  loadAllProjectsMetadata,
  loadOneProjectFrontend,
} from "abcde-test/src/loaders/frontend/loaders";
import { loadOneProject } from "abcde-test/src/loaders/loaders";

export async function noAuthGetProjects() {
  return await loadAllProjectsMetadata();
}

export async function noAuthLoadProject({ projectName, configName }) {
  if (!projectName) {
    return await loadOneProject({});
  }
  return await loadOneProjectFrontend({ projectName, configName });
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
