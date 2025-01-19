import C from "constants/constants.json";
import { post } from "./utils";

export async function dbRestartLanguageServer() {
  return await post({ body: {}, address: C.ROUTE_RESTART_LANGUAGE_SERVER });
}
