import axios from "axios";
import { BACKEND } from "../utils/constants";
import { getAllNonFunctions } from "../utils/commonFunctions"
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

export const createUI = ({ token, enteredText }) => {
  const body = JSON.stringify({ enteredText });
  return axios
    .post(BACKEND + "api/create_ui", body, tokenConfig(token))
    .then((res) => res.data)
    .catch((err) => {});
};

export const saveUI = ({ token, uiName, sections, selected, globalCurr }) => {
  sections = JSON.stringify(sections);
  selected = JSON.stringify(selected);
  globalCurr = JSON.stringify(globalCurr);
  const body = JSON.stringify({ uiName, sections, selected, globalCurr });
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
  let completeState = {}
  for (let key of Object.keys(statesToSave)){
    completeState[key] = JSON.stringify(getAllNonFunctions(statesToSave[key]))
  }
  completeState = JSON.stringify(completeState)
  const body = JSON.stringify({ completeState });
  console.log("sending body:")
  console.log(body)
  return axios
    .post(BACKEND + "api/draft_ui", body, tokenConfig(token))
    .then((res) => {})
    .catch((err) => {});
};

export const loadDraftUI = ({ token }) => {
  return axios
    .get(BACKEND + "api/draft_ui", tokenConfig(token))
    .then((res) => res.data)
    .catch((err) => {});
};
