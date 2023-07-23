import { createInMemProject } from "abcde-test/src/loaders/createInMem";
import {
  loadAllProjectMetadata,
  loadTestData,
} from "abcde-test/src/loaders/loaders";

export async function noAuthGetProjects() {
  return { data: await loadAllProjectMetadata() };
}

export async function noAuthLoadProject({ projectName, configName }) {
  return await loadTestData({
    projectName,
    configName,
    format: "loadProjectToFrontend",
  });
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
