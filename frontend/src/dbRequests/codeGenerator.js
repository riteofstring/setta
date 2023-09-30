import { GENERATE_CODE } from "abcde-utils/src/routes";
import { post } from "./utils";

export async function generateCode({ codeId, project }) {
  return post({
    address: GENERATE_CODE,
    body: { codeId, project },
  });
}
