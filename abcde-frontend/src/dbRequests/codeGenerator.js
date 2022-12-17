import axios from "axios";
import { BACKEND, NO_AUTH } from "utils/constants";
import { tokenConfig } from "./authentication";
import { noAuthGenerateCode } from "./noAuth/codeGenerator";

export async function generateCode({ codeId, project }) {
  if (NO_AUTH) {
    return noAuthGenerateCode();
  }

  const access_token = useAuth.getState().access_token;
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
