import axios from "axios";
import { BACKEND } from "../utils/constants";
import { stringifyCompleteState } from "../utils/commonFunctions";
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

export const saveUI = ({ token, folderName, uiName, statesToSave }) => {
  console.log("folderName, uiName", folderName, uiName)
  const body = JSON.stringify({
    ui: {
      uiName,
      completeState: stringifyCompleteState(statesToSave),
    },
    folder: { folderName },
  });
  return axios
    .post(BACKEND + "api/saved_folder_and_ui", body, tokenConfig(token))
    .then((res) => {})
    .catch((err) => {});
};

export const loadFolderAndUINames = ({ token }) => {
  return axios
    .get(BACKEND + "api/saved_folder_and_ui_names", tokenConfig(token))
    .then((res) => res.data["folderAndUINames"])
    .catch((err) => {});
};

export const loadUI = ({ token, folderName, uiName }) => {
  const fullName = folderName + ":" + uiName
  return axios
    .get(BACKEND + "api/saved_folder_and_ui/" + fullName, tokenConfig(token))
    .then((res) => res.data)
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
