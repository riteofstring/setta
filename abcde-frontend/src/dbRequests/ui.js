import axios from "axios";

import { allFoldersQuery, UIQuery } from "../graphql/queries/uiQueries";
import { stringifyCompleteState } from "../utils/commonFunctions";
import { BACKEND } from "../utils/constants";
import { tokenConfig } from "./authentication";

export const generateAndRunCode = ({
  cliSocket,
  SELECTED,
  FACTORIES,
  FUNCS,
}) => {
  const body = JSON.stringify({ code: { SELECTED, FACTORIES, FUNCS } });
  cliSocket.send(body);
};

export const createUI = ({ cliSocket, enteredText }) => {
  const body = JSON.stringify({ enteredText });
  cliSocket.send(body);
};

export const saveUI = ({ token, name, folder, ui }) => {
  const body = { ui: { name, ...ui }, folder: { name: folder } };
  return axios
    .post(BACKEND + "api/foldersAndUIs", body, tokenConfig(token))
    .then((res) => {})
    .catch((err) => {});
};

export const loadFolderAndUINames = ({ token }) => {
  const query = allFoldersQuery();
  return axios
    .post(
      BACKEND + "graphql",
      JSON.stringify({ query: query }),
      tokenConfig(token)
    )
    .then((res) => res.data.data.allFolders)
    .catch((err) => {});
};

export const createNewFolder = ({ token, name }) => {
  return axios
    .post(BACKEND + "api/folders", { name }, tokenConfig(token))
    .then((res) => {})
    .catch((err) => {});
};

export const loadUI = ({ token, folderName, uiName }) => {
  console.log("loadUI", token, folderName, uiName);
  const query = UIQuery(uiName);
  console.log("query", query);
  return axios
    .post(
      BACKEND + "graphql",
      JSON.stringify({ query: query }),
      tokenConfig(token)
    )
    .then((res) => res.data.data.fullUi)
    .catch((err) => {});
};

export const saveDraftUI = ({ token, statesToSave }) => {
  const body = JSON.stringify({
    completeState: stringifyCompleteState(statesToSave),
  });
  return axios
    .post(BACKEND + "api/draft_ui", body, tokenConfig(token))
    .then((res) => res.data)
    .catch((err) => {});
};

export const loadDraftUI = ({ token }) => {
  return axios
    .get(BACKEND + "api/draft_ui", tokenConfig(token))
    .then((res) => res.data)
    .catch((err) => {});
};
