import { immerable } from "immer";

import { requiresNestedSection } from "../utils/constants";

export class UIType {
  [immerable] = true;
  constructor({ id, name, configId }) {
    this.id = id;
    this.name = name;
    this.configId = configId;
  }

  get isNested() {
    return requiresNestedSection(this.name);
  }
}
