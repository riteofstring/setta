import axios from "axios";
import { BACKEND, NO_AUTH } from "utils/constants";
import { tokenConfig } from "./authentication";

export async function generateCode({ access_token, codeId, codeJson }) {
  if (NO_AUTH) {
    return true;
  }
  return axios
    .post(
      BACKEND + "codeGenerator/generateCode",
      { codeId, codeJson },
      tokenConfig(access_token)
    )
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return {};
    });
}
