import { requiresNestedSection } from "../utils/constants";
import { MutableInfo } from "./mutableInfo";

export class UIType extends MutableInfo {
  constructor({ id, name, configId }) {
    super();
    this.id = id;
    this.name = name;
    this.configId = configId;
    this.exportable = ["id", "name", "configId"];
  }

  get isNested() {
    return requiresNestedSection(this.name);
  }
}
