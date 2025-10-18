import {
  adjectives,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";

export function createNewId() {
  return uuidv4();
}

export function createRandomName() {
  const customConfig = {
    dictionaries: [adjectives, colors],
    separator: "_",
    length: 2,
  };

  return uniqueNamesGenerator(customConfig);
}
