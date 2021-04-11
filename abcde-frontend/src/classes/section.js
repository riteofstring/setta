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
    this.hasBeenVisited = defaultDict(() => ({}));
    this.childrenAreCollapsed = {};
    this.sectionHeading = sectionHeading;
  }

  getChildrenIds = () => {
    return this.childrenIds[this.selected.asString];
  };

  getChildrenAreCollapsed = () => {
    return this.childrenAreCollapsed[this.selected.asString];
  };

  getHasBeenVisited = (paramName) => {
    return this.hasBeenVisited[this.selected.asString][paramName];
  };

  getParamData = (paramName, dataName) => {
    return this.sectionInfo.getParamData(
      this.selected.moduleName,
      this.selected.objName,
      paramName,
      dataName
    );
  };

  setParamData = (paramName, dataName, value) => {
    this.sectionInfo.setParamData(
      this.selected.moduleName,
      this.selected.objName,
      paramName,
      dataName,
      value
    );
  };

  getEnteredValue = (paramName) => {
    return this.getParamData(paramName, "enteredValue");
  };

  getParamUIType = (paramName) => {
    return this.getParamData(paramName, "uiType");
  };

  setChildrenAreCollapsed = (childrenAreCollapsed) => {
    this.childrenAreCollapsed[this.selected.asString] = childrenAreCollapsed;
  };

  setHasBeenVisited = (paramName, hasBeenVisited) => {
    this.hasBeenVisited[this.selected.asString][paramName] = hasBeenVisited;
  };

  setChildrenIds = (childrenIds) => {
    this.childrenIds[this.selected.asString] = childrenIds;
  };

  setSelected = (moduleName, objName) => {
    this.selected = new Selected(moduleName, objName);
  };

  setEnteredValue = (paramName, value) => {
    this.setParamData(paramName, "enteredValue", value);
  };

  setParamUIType = (paramName, uiName) => {
    this.setParamData(paramName, "uiType", uiName);
  };

  setUIType = (uiType) => {
    this.uiType = uiType;
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

  getObjData = (dataName) => {
    return this.sectionInfo.getObjData(
      this.selected.moduleName,
      this.selected.objName,
      dataName
    );
  };

  getKwargs = () => {
    return this.getObjData("kwargs");
  };

  getParameters = () => {
    return this.getObjData("params");
  };
}
