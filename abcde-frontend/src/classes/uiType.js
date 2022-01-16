import { MutableInfo } from "./mutableInfo";

export class UIType extends MutableInfo {
  constructor({ id, name, config = {}, isDefault }) {
    super();
    this.id = id;
    this.name = name;
    this.config = config;
    this.isDefault = isDefault;
    this.exportable = ["id", "name", "config"];
  }
}
