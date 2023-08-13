import { createInMemProject } from "abcde-test/src/loaders/createInMem";
import {
  loadAllProjectMetadata,
  loadTestData,
} from "abcde-test/src/loaders/loaders";

export async function noAuthGetProjectsForFileMenu({ projectId }) {
  const projectMetadata = Object.values(await loadAllProjectMetadata());
  const data = [];
  for (const p of projectMetadata) {
    if (!projectId) {
      data.push({ ...p, selectable: false, depth: 0 });
      for (const c of p.configs) {
        data.push({ ...c, projectName: p.name, selectable: true, depth: 1 });
      }
    } else if (projectId === p.id) {
      for (const c of p.configs) {
        data.push({ ...c, projectName: p.name, selectable: true, depth: 0 });
      }
    }
  }
  return { data, status: 200 };
}

export async function noAuthGetProjectsForHomePage() {
  const projectMetadata = Object.values(await loadAllProjectMetadata());
  return { data: projectMetadata, status: 200 };
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
