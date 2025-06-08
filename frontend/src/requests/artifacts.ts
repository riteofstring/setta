import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbLoadArtifacts(artifactIds) {
  return await post({
    body: { artifactIds },
    address: RouteEnum.LOAD_ARTIFACTS,
  });
}

export async function dbLoadAvailableArtifacts(sectionType) {
  return await post({
    body: { sectionType },
    address: RouteEnum.LOAD_AVAILABLE_ARTIFACTS,
  });
}

export async function dbCheckIfFileExists(filepath) {
  return await post({
    body: { filepath },
    address: RouteEnum.CHECK_IF_FILE_EXISTS,
  });
}

export async function dbLoadArtifactFromDisk(filepath, type) {
  return await post({
    body: { filepath, type },
    address: RouteEnum.LOAD_ARTIFACT_FROM_DISK,
  });
}

export async function dbReadCSVBase64(base64Str) {
  return await post({
    body: { base64Str },
    address: RouteEnum.READ_CSV_BASE64,
  });
}
