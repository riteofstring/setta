import { immerable } from "immer";

export const UITYPES = [
  "TEXT",
  "SLIDER",
  "NESTED_OBJECT",
  "LIST_NESTED_OBJECT",
  "DICT_NESTED_OBJECT",
];

function requiresNestedSection(uiTypeName) {
  return ["NESTED_OBJECT", "LIST_NESTED_OBJECT", "DICT_NESTED_OBJECT"].includes(
    uiTypeName
  );
}

export class UIType {
  [immerable] = true;
  constructor({ id, name, configId }) {
    this.id = id;
    this.name = name;
    this.isNested = requiresNestedSection(this.name);
    this.configId = configId;
  }
}
