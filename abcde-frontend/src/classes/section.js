import { nullOrUndefined, defaultDict, insertIntoArray } from "../utils/utils";
import { Selected } from "./selected";
import { UIType } from "./uiType";

export class Section {
  constructor(sectionInfo, sectionHeading) {
    this.sectionInfo = sectionInfo;
    this.parent = null;
    this.childrenIds = defaultDict(() => []);
    this.selected = new Selected();
    this.uiType = new UIType("OBJECT");
    this.hasBeenVisited = {};
    this.childrenAreCollapsed = {};
    this.sectionHeading = sectionHeading;
  }

  getChildrenIds = () => {
    const key = this.selected.asString;
    if (!nullOrUndefined(key)) {
      return this.childrenIds[key];
    }
    return [];
  };

  getChildrenAreCollapsed = () => {
    return this.childrenAreCollapsed[this.selected.asString];
  };

  getHasBeenVisited = () => {
    return this.hasBeenVisited[this.selected.asString];
  };

  getEnteredValue = (paramName) => {
    return this.sectionInfo.getValue(
      this.selected.moduleName,
      this.selected.objName,
      paramName
    );
  };

  getParamUIType = (paramName) => {
    return this.sectionInfo.getParamUIType(
      this.selected.moduleName,
      this.selected.objName,
      paramName
    );
  };

  setChildrenAreCollapsed = (childrenAreCollapsed) => {
    this.childrenAreCollapsed[this.selected.asString] = childrenAreCollapsed;
  };

  setHasBeenVisited = (hasBeenVisited) => {
    this.hasBeenVisited[this.selected.asString] = hasBeenVisited;
  };

  setChildrenIds = (childrenIds) => {
    const key = this.selected.asString;
    if (!nullOrUndefined(key)) {
      this.childrenIds[key] = childrenIds;
    }
  };

  setSelected = (moduleName, objName) => {
    this.selected = new Selected(moduleName, objName);
  };

  setEnteredValue = (paramName, value) => {
    this.sectionInfo.setValue(
      this.selected.moduleName,
      this.selected.objName,
      paramName,
      value
    );
  };

  setParamUIType = (paramName, uiName) => {
    this.sectionInfo.setParamUIType(
      this.selected.moduleName,
      this.selected.objName,
      paramName,
      uiName
    );
  };

  hasNested = () => {
    return this.getChildrenIds().length > 0;
  };

  addChildren = (childIds, idx = null) => {
    const key = this.selected.asString;
    if (idx === null) {
      this.childrenIds[key] = [...this.childrenIds[key], ...childIds];
    } else {
      this.childrenIds[key] = insertIntoArray(
        this.childrenIds[key],
        idx,
        ...childIds
      );
    }
  };

  deleteChildren = (childIds) => {
    const key = this.selected.asString;
    this.childrenIds[key] = this.childrenIds[key].filter(
      (x) => !childIds.includes(x)
    );
  };

  addKwarg = (paramName) => {
    this.sectionInfo.addKwarg(
      this.selected.moduleName,
      this.selected.objName,
      paramName
    );
  };

  getKwargs = () => {
    return this.sectionInfo.getKwargs(
      this.selected.moduleName,
      this.selected.objName
    );
  };

  getParameters = () => {
    return this.sectionInfo.getParameters(
      this.selected.moduleName,
      this.selected.objName
    );
  };
}
