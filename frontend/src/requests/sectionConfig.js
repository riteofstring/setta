import C from "constants/constants.json";
import { post } from "./utils";

export async function dbSaveCodeInfo({ codeInfo }) {
  return await post({
    address: C.ROUTE_SAVE_CODE_INFO,
    body: { codeInfo },
  });
}
