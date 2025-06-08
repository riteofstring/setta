import { addTemporaryNotification } from "state/actions/notifications";
import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbRestartLanguageServer() {
  addTemporaryNotification("Restarting Language Server");
  return await post({ body: {}, address: RouteEnum.RESTART_LANGUAGE_SERVER });
}
