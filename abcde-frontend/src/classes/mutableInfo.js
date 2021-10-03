import { convertSpecsToDict } from "./immutableInfo";

export class MutableParamInfo {
  constructor({ id, uiTypeId, enteredValue, childId }) {
    this.id = id;
    this.uiTypeId = uiTypeId;
    this.enteredValue = enteredValue;
    this.childId = childId;
  }
}

export class SectionInfo {
  constructor({
    id,
    name,
    specs,
    objCollectionIds = {},
    paramCollectionIds = {},
  }) {
    this.id = id;
    this.name = name;
    this.specs = convertSpecsToDict(specs);
    this.hasObjects = "objects" in this.specs;
    this.objCollectionIds = objCollectionIds;
    this.paramCollectionIds = paramCollectionIds;
  }
}
