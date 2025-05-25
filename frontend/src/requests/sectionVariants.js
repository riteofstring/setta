import { C } from "utils/c";
import { post } from "./utils";

export async function dbNewVersionFilename(filename) {
  return await post({
    body: { filename },
    address: C.ROUTE_NEW_JSON_VERSION_NAME,
  });
}
