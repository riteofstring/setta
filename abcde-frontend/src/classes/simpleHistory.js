import { createDefaultNestedDict } from "../utils/utils";

export class SimpleHistory {
  constructor(depth, final_value) {
    this.history = createDefaultNestedDict(depth, final_value);
  }
}
