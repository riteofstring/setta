import axios from "axios";
import { BACKEND, NO_AUTH } from "utils/constants";
import { tokenConfig } from "./authentication";
import { noAuthGenerateCode } from "./noAuth/codeGenerator";

export async function generateCode({ access_token, codeId, project }) {
  if (NO_AUTH) {
    return noAuthGenerateCode();
  }

  return axios
    .post(
      BACKEND + "codeGenerator/generateCode",
      { codeId, project },
      tokenConfig(access_token)
    )
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return {};
    });
}
