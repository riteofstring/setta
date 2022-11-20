import axios from "axios";
import { BACKEND } from "utils/constants";

import { tokenConfig } from "./authentication";

export const saveUI = ({ access_token, name, folder, ui }) => {
  const body = { ui: { name, ...ui }, folder: { name: folder } };
  return axios
    .post(BACKEND + "api/foldersAndUIs", body, tokenConfig(access_token))
    .then((res) => {})
    .catch((err) => {});
};

export const loadFolderAndUINames = ({ access_token }) => {
  const query = allFoldersQuery();
  return axios
    .post(
      BACKEND + "graphql",
      JSON.stringify({ query: query }),
      tokenConfig(access_token)
    )
    .then((res) => res.data.data.allFolders)
    .catch((err) => {});
};

export const createNewFolder = ({ access_token, name }) => {
  return axios
    .post(BACKEND + "api/folders", { name }, tokenConfig(access_token))
    .then((res) => {})
    .catch((err) => {});
};

export const loadUI = ({ access_token, folderName, uiName }) => {
  console.log("loadUI", access_token, folderName, uiName);
  const query = UIQuery(uiName);
  console.log("query", query);
  return axios
    .post(
      BACKEND + "graphql",
      JSON.stringify({ query: query }),
      tokenConfig(access_token)
    )
    .then((res) => res.data.data.fullUi)
    .catch((err) => {});
};
