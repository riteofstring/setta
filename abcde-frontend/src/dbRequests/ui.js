import axios from "axios";
import { BACKEND } from "../utils/constants";
import { tokenConfig } from "./authentication";

export const saveUI = ({ token, uiName, sections, selections, globalCurr }) => {
  sections = JSON.stringify(sections)
  selections = JSON.stringify(selections)
  globalCurr = JSON.stringify(globalCurr)
  const body = JSON.stringify({ uiName, sections, selections, globalCurr });
  return axios
    .post(BACKEND.concat("api/saved_uis"), body, tokenConfig(token))
    .then((res) => {})
    .catch((err) => {});
};
