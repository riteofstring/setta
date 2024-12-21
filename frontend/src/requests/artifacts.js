import C from "constants/constants.json";
import { post } from "./utils";

export async function dbLoadArtifacts(sectionId, artifactPaths) {
  return await post({
    body: { sectionId, artifactPaths },
    address: C.ROUTE_LOAD_ARTIFACTS,
  });
}
