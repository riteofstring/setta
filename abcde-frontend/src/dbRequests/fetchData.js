import axios from "axios";
import { BACKEND } from "../utils/constants";

export const getUISpecs = () => {
  return axios.get(BACKEND+"api/ui_specs");
};
