import axios from "axios";
import { BACKEND } from "../utils/constants";
import { tokenConfig } from "./authentication";

export const createUI = ({ token, uiSpecs }) => {
  const body = JSON.stringify({ uiSpecs });
  return axios
    .post(BACKEND + "api/create_ui", body, tokenConfig(token))
    .then((res) => res.data["uiAsJson"])
    .catch((err) => {});
};

export const saveUI = ({ token, uiName, sections, selections, globalCurr }) => {
  sections = JSON.stringify(sections);
  selections = JSON.stringify(selections);
  globalCurr = JSON.stringify(globalCurr);
  const body = JSON.stringify({ uiName, sections, selections, globalCurr });
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
