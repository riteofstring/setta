import { LOAD_SETTINGS } from "z_utils/routes";
import { post } from "./utils";

export async function dbLoadSettings() {
  return await post({
    address: LOAD_SETTINGS,
    body: {},
  });
}
