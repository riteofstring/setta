import { immerable } from "immer";

export class MutableParamInfo {
  constructor({ id, uiTypeId, enteredValue, childId }) {
    this[immerable] = true;
    this.id = id;
    this.uiTypeId = uiTypeId;
    this.enteredValue = enteredValue;
    this.childId = childId;
  }
}
