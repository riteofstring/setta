import { MutableInfo } from "./mutableInfo";

export class UIType extends MutableInfo {
  constructor({ id, name, config }) {
    super();
    this.id = id;
    this.name = name;
    this.config = config;
    this.exportable = ["id", "name", "config"];
  }
}
