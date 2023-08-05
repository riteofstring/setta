import { createInMemProject } from "abcde-test/src/loaders/createInMem";
import {
  loadAllProjectMetadata,
  loadTestData,
} from "abcde-test/src/loaders/loaders";

export async function noAuthGetProjects() {
  const projectMetadata = await loadAllProjectMetadata();
  const data = [];
  for (const p of Object.values(projectMetadata)) {
    data.push({ ...p, selectable: false, depth: 0 });
    for (const c of p.configs) {
      data.push({ ...c, projectName: p.name, selectable: true, depth: 1 });
    }
  }
  return { data, status: 200 };
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
  return { data: createInMemProject(name) };
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
