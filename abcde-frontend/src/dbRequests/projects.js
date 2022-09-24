import axios from "axios";
import { BACKEND, NO_AUTH } from "utils/constants";
import Projects from "__tests__data/Projects";
import { tokenConfig } from "./authentication";

export async function getProjects({ access_token }) {
  if (NO_AUTH) {
    return Projects;
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
  if (NO_AUTH) {
    return Projects[id];
  }

  return axios
    .post(BACKEND + `projects/${id}`, null, tokenConfig(access_token))
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return [];
    });
}
