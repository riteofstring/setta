import { C } from "utils/constants";
import { post } from "./utils";

export async function dbLoadSettings() {
  return await post({
    address: C.ROUTE_LOAD_SETTINGS,
    body: {},
  });
}
