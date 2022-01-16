import { SET_FROM_SIDEPANE } from "utils/constants";

import { MutableInfo } from "./mutableInfo";

export class UIType extends MutableInfo {
  constructor({ id, name, config = {}, origin = SET_FROM_SIDEPANE }) {
    super();
    this.id = id;
    this.name = name;
    this.config = config;
    this.origin = origin;
    this.exportable = ["id", "name", "config"];
  }
}
