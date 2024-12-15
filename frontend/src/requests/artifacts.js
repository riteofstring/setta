import C from "constants/constants.json";
import { post } from "./utils";

export async function dbLoadArtifacts(artifactIds) {
  return await post({
    body: { artifactIds },
    address: C.ROUTE_LOAD_ARTIFACTS,
  });
}

export async function dbLoadAvailableArtifacts(sectionType) {
  return await post({
    body: { sectionType },
    address: C.ROUTE_LOAD_AVAILABLE_ARTIFACTS,
  });
}
