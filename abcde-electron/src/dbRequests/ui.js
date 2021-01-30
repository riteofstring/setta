import axios from "axios";
import { BACKEND } from "../utils/constants";
import { tokenConfig } from "./authentication";


export const getLatestCode = ({ token }) => {
  return axios
    .get(BACKEND + "api/generate_code", tokenConfig(token))
    .then((res) => res)
    .catch((err) => false);
};