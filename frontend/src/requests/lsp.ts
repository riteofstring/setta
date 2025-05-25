import { addTemporaryNotification } from "state/actions/notifications";
import { C } from "utils/c";
import { post } from "./utils";

export async function dbRestartLanguageServer() {
  addTemporaryNotification("Restarting Language Server");
  return await post({ body: {}, address: C.ROUTE_RESTART_LANGUAGE_SERVER });
}
