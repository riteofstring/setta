import axios from "axios";
import { BACKEND, NO_AUTH } from "utils/constants";
import { tokenConfig } from "./authentication";
import {
  noAuthCreateProject,
  noAuthGetProjects,
  noAuthLoadProject,
  noAuthSaveAsNewProjectConfig,
  noAuthSaveProject,
} from "./noAuth/projects";

export async function getProjects({ access_token }) {
  if (NO_AUTH) {
    return await noAuthGetProjects();
  }

  return axios
    .post(BACKEND + "projects", null, tokenConfig(access_token))
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}

export async function loadProject({ access_token, id, configId }) {
  if (NO_AUTH) {
    return await noAuthLoadProject({ id, configId });
  }

  return axios
    .post(
      BACKEND + `projects/load/${id}/${configId}`,
      null,
      tokenConfig(access_token)
    )
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}

export async function createProject({ access_token, name }) {
  if (NO_AUTH) {
    return await noAuthCreateProject({ name });
  }

  return axios
    .post(
      BACKEND + `projects/createProject`,
      { name },
      tokenConfig(access_token)
    )
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}

export async function saveProject({ access_token, project }) {
  if (NO_AUTH) {
    return await noAuthSaveProject();
  }

  return axios
    .post(
      BACKEND + `projects/save`,
      { access_token, project },
      tokenConfig(access_token)
    )
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}

export async function saveAsNewProjectConfig({
  access_token,
  project,
  newConfigName,
}) {
  if (NO_AUTH) {
    return await noAuthSaveAsNewProjectConfig();
  }
  return axios
    .post(
      BACKEND + `projects/saveAsNewProjectConfig`,
      { project, newConfigName },
      tokenConfig(access_token)
    )
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}
