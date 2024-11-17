import C from "constants/constants.json";
import {
  adjectives,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { v4 as uuidv4, validate } from "uuid";

export function createNewId() {
  return uuidv4();
}

export function maybeNewId(x) {
  return x ? x : createNewId();
}

export function createNewParamId(paramPath, jsonSource) {
  if (jsonSource) {
    const metadata = JSON.stringify({ filenameGlob: jsonSource, key: paramPath });
    return `${C.JSON_SOURCE_PREFIX}${metadata}`;
  }
  return createNewId();
}

export function isUUID(x) {
  return validate(x);
}

export function createVarName(existingVarNames) {
  const customConfig = {
    dictionaries: [adjectives, colors],
    separator: "_",
    length: 2,
  };

  let varName;
  while (!varName || existingVarNames.includes(varName)) {
    varName = uniqueNamesGenerator(customConfig);
  }

  return varName;
}

export function createRandomName() {
  const customConfig = {
    dictionaries: [adjectives, colors],
    separator: "_",
    length: 2,
  };

  return uniqueNamesGenerator(customConfig);
}
