import { createInMemProject } from "abcde-test/src/loaders/createInMem";
import {
  loadAllProjectMetadata,
  loadTestData,
} from "abcde-test/src/loaders/loaders";

export async function noAuthGetProjects() {
  return { data: await loadAllProjectMetadata(), status: 200 };
}

export async function noAuthLoadProject({ projectName, configName }) {
  return {
    data: await loadTestData({
      projectName,
      configName,
      format: "loadProjectToFrontend",
    }),
    status: 200,
  };
}

export async function noAuthCreateProject({ name }) {
  return createInMemProject(name);
}

export async function noAuthSaveProject() {
  return { status: 200 };
}

export async function noAuthSaveAsNewProjectConfig() {
  return true;
}

export async function noAuthSaveAsExistingProjectConfig() {
  return true;
}
