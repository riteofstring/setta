import C from "constants/constants.json";
import { addTemporaryNotification } from "state/actions/notifications";
import { post } from "./utils";

export async function dbRestartLanguageServer() {
  addTemporaryNotification("Restarting Language Server");
  return await post({ body: {}, address: C.ROUTE_RESTART_LANGUAGE_SERVER });
}

export async function dbReadGenPythonCode() {
  return await post({ body: {}, address: C.ROUTE_READ_GEN_PYTHON_CODE });
}
