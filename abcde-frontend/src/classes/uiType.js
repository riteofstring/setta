import { SET_FROM_SIDEPANE } from "utils/constants";
import { maybeNewId } from "utils/utils";

import { MutableInfo } from "./mutableInfo";

export class UIType extends MutableInfo {
  constructor({
    id,
    type,
    name = "",
    config = {},
    origin = SET_FROM_SIDEPANE,
    isPreset = false,
  }) {
    super();
    this.id = maybeNewId(id);
    this.type = type;
    this.name = name;
    this.config = config;
    this.origin = origin;
    this.isPreset = isPreset;
    this.exportable = ["id", "name", "config"];
  }
}
