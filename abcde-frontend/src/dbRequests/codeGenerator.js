import axios from "axios";
import { BACKEND, NO_AUTH } from "utils/constants";
import { tokenConfig } from "./authentication";

export async function generateCode({ access_token, codeJson }) {
  if (NO_AUTH) {
    return { id: "no_auth_dummy" };
  }
  return axios
    .post(
      BACKEND + "codeGenerator/generateCode",
      { codeJson },
      tokenConfig(access_token)
    )
    .then((res) => {
      return res.data;
    })
    .catch(() => {
      return {};
    });
}
