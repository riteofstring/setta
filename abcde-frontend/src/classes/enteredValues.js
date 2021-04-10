import { nullOrUndefined, defaultDict } from "../utils/utils";

export class EnteredValues {
  constructor() {
    this.objParams = defaultDict(() => ({}));
    this.params = {};
  }

  setValue = (selectedObjAsString, paramName, value) => {
    if (nullOrUndefined(selectedObjAsString)) {
      this.params[paramName] = value;
    } else {
      this.objParams[selectedObjAsString][paramName] = value;
    }
  };

  getValue = (selectedObjAsString, paramName) => {
    if (nullOrUndefined(selectedObjAsString)) {
      return this.params[paramName];
    }
    return this.objParams[selectedObjAsString][paramName];
  };
}
