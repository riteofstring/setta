import { createDefaultNestedDict } from "../utils/utils";

export class SimpleHistory {
  constructor(depth, final_value_fn) {
    this.h = createDefaultNestedDict(depth, final_value_fn);
  }
}
