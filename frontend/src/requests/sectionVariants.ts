import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbNewVersionFilename(filename) {
  return await post({
    body: { filename },
    address: RouteEnum.NEW_JSON_VERSION_NAME,
  });
}
