import axios from "axios";
import { BACKEND } from "../utils/constants";
import { stringifyCompleteState } from "../utils/commonFunctions";
import { tokenConfig } from "./authentication";

export const generateCode = ({
  token,
  codeToken,
  SELECTED,
  FACTORIES,
  FUNCS,
}) => {
  const body = JSON.stringify({ codeToken, SELECTED, FACTORIES, FUNCS });
  return axios
    .post(BACKEND + "api/generate_code", body, tokenConfig(token))
    .then((res) => true)
    .catch((err) => false);
};

export const createUI = ({ cliSocket, enteredText }) => {
  const body = JSON.stringify({enteredText});
  cliSocket.send(body)
};

export const saveUI = ({
  token,
  uiName,
  versionName,
  rootSections,
  statesToSave,
}) => {
  const completeState = stringifyCompleteState(statesToSave);
  const body = JSON.stringify({
    ui: { uiName, rootSections },
    version: { versionName, completeState },
  });
  return axios
    .post(BACKEND + "api/saved_uis", body, tokenConfig(token))
    .then((res) => {})
    .catch((err) => {});
};

export const loadUINames = ({ token }) => {
  return axios
    .get(BACKEND + "api/saved_ui_names", tokenConfig(token))
    .then((res) => res.data["uiNames"])
    .catch((err) => {});
};

export const loadUI = ({ token, uiName }) => {
  return axios
    .get(BACKEND + "api/saved_uis/" + uiName, tokenConfig(token))
    .then((res) => res.data)
    .catch((err) => {});
};

export const saveDraftUI = ({ token, statesToSave }) => {
  const completeState = stringifyCompleteState(statesToSave);
  const body = JSON.stringify({ completeState });
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
