import { NO_AUTH } from "utils/constants";
import { noAuthGenerateCode } from "./noAuth/codeGenerator";
import { post } from "./utils";

export async function generateCode({ codeId, project }) {
  if (NO_AUTH) {
    return noAuthGenerateCode();
  }

  return post({
    address: "codeGenerator/generateCode",
    body: { codeId, project },
    thenFn: (res) => res.data,
    catchFn: () => ({}),
    withCredentials: true,
  });
}
