import { GENERATE_CODE } from "z_utils/routes";
import { post } from "./utils";

export async function generateCode({ codeId, project }) {
  return post({
    address: GENERATE_CODE,
    body: { codeId, project },
  });
}
