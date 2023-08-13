import { GENERATE_CODE } from "abcde-utils/src/routes";
import { NO_AUTH } from "utils/constants";
import { noAuthGenerateCode } from "./noAuth/codeGenerator";
import { post } from "./utils";

export async function generateCode({ codeId, project }) {
  if (NO_AUTH) {
    return noAuthGenerateCode();
  }

  return post({
    address: GENERATE_CODE,
    body: { codeId, project },
    withCredentials: true,
  });
}
