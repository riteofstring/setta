import {
  adjectives,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
export const ARTIFACTS_ROOT = "artifacts";

export function createNewId() {
  return uuidv4();
}

function createArtifactId(extension: string = ".json") {
  return `${ARTIFACTS_ROOT}/${createNewId()}${extension}`;
}

export function createJsonArtifactId() {
  return createArtifactId(".json");
}

export function createCsvArtifactId() {
  return createArtifactId(".csv");
}

export function createPngArtifactId() {
  return createArtifactId(".png");
}

export function createFileArtifactId(extension: string = ".bin") {
  return createArtifactId(extension);
}

export function createRandomName() {
  const customConfig = {
    dictionaries: [adjectives, colors],
    separator: "_",
    length: 2,
  };

  return uniqueNamesGenerator(customConfig);
}
