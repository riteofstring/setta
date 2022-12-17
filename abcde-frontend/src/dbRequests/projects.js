import axios from "axios";
import { useAuth } from "models/auth";
import { BACKEND, NO_AUTH } from "utils/constants";
import { tokenConfig } from "./authentication";
import {
  noAuthCreateProject,
  noAuthGetProjects,
  noAuthLoadProject,
  noAuthSaveAsExistingProjectConfig,
  noAuthSaveAsNewProjectConfig,
  noAuthSaveProject,
} from "./noAuth/projects";

export async function getProjects() {
  if (NO_AUTH) {
    return await noAuthGetProjects();
  }

  const access_token = useAuth.getState().access_token;
  return axios
    .post(BACKEND + "projects", null, tokenConfig(access_token))
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}

export async function loadProject({ id, configId }) {
  if (NO_AUTH) {
    return await noAuthLoadProject({ id, configId });
  }

  const access_token = useAuth.getState().access_token;
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

export async function createProject({ name }) {
  if (NO_AUTH) {
    return await noAuthCreateProject({ name });
  }

  const access_token = useAuth.getState().access_token;
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

export async function saveProject({ project }) {
  if (NO_AUTH) {
    return await noAuthSaveProject();
  }

  const access_token = useAuth.getState().access_token;
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

export async function saveAsNewProjectConfig({ project, newConfigName }) {
  if (NO_AUTH) {
    return await noAuthSaveAsNewProjectConfig();
  }
  const access_token = useAuth.getState().access_token;
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

export async function saveAsExistingProjectConfig({ project, configId }) {
  if (NO_AUTH) {
    return await noAuthSaveAsExistingProjectConfig();
  }

  const access_token = useAuth.getState().access_token;
  return axios
    .post(
      BACKEND + `projects/saveAsExistingProjectConfig`,
      { project, configId },
      tokenConfig(access_token)
    )
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}
