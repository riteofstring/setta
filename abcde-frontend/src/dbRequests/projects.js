import axios from "axios";
import { BACKEND, NO_AUTH } from "utils/constants";
import { loadTestData } from "__tests__utils/loadTestData";
import { tokenConfig } from "./authentication";

export async function getProjects({ access_token }) {
  if (NO_AUTH) {
    const testData = await loadTestData();
    return [testData.project];
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

export async function loadProject({ access_token, id }) {
  return axios
    .post(BACKEND + `projects/load/${id}`, null, tokenConfig(access_token))
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}

export async function createProject({ access_token, name }) {
  const body = JSON.stringify({ name });
  return axios
    .post(BACKEND + `projects/createProject`, body, tokenConfig(access_token))
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}

export async function saveProject({ access_token, project }) {
  const body = JSON.stringify({ access_token, project });
  return axios
    .post(BACKEND + `projects/save`, body, tokenConfig(access_token))
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}
