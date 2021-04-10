import { nullOrUndefined } from "../utils/utils";

export class Selected {
  constructor(moduleName, objName) {
    this.moduleName = moduleName;
    this.objName = objName;
  }

  asString = () => {
    if (!nullOrUndefined(this.moduleName) && !nullOrUndefined(this.objName)) {
      return `${this.moduleName}~${this.objName}`;
    }
    return null;
  };
}
