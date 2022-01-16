import { SET_FROM_SIDEPANE } from "utils/constants";

import { MutableInfo } from "./mutableInfo";

export class UIType extends MutableInfo {
  constructor({ id, type, name = "", origin = SET_FROM_SIDEPANE }) {
    super();
    this.id = id;
    this.type = type;
    this.name = name;
    this.origin = origin;
    this.exportable = ["id", "name", "config"];
  }
}
