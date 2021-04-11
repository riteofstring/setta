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
    this.nestedSectionIds = defaultDict(() => defaultDict(() => []));
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

  getNestedSectionIds = (paramName, returnFirst = false) => {
    const output = this.nestedSectionIds[this.selected.asString][paramName];
    if (returnFirst) {
      return output ? output[0] : undefined;
    }
    return output;
  };

  getDefaultValue = (paramName) => {
    return this.getParamData(paramName, "defaultVal");
  };

  getParamUITypeConfig = (paramName) => {
    return this.getParamUIType(paramName).config;
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
    this.setParamData(paramName, "uiType", new UIType(uiName));
  };

  setUIType = (uiType) => {
    this.uiType = uiType;
  };

  setNestedSectionIds = (paramName, nestedSectionIds) => {
    this.nestedSectionIds[this.selected.asString][paramName] = nestedSectionIds;
  };

  setParamUITypeConfig = (paramName, configName, value) => {
    this.getParamUIType(paramName).setConfig(configName, value);
  };

  hasNested = () => {
    return this.getChildrenIds().length > 0;
  };

  addChildren = (childIds, paramName, idx = null) => {
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
    this.nestedSectionIds[this.selected.asString][paramName] = [
      ...this.nestedSectionIds[this.selected.asString][paramName],
      ...childIds,
    ];
  };

  deleteChildren = (childIds, paramName) => {
    const key = this.selected.asString;
    this.childrenIds[key] = this.childrenIds[key].filter(
      (x) => !childIds.includes(x)
    );
    this.nestedSectionIds[this.selected.asString][
      paramName
    ] = this.nestedSectionIds[this.selected.asString][paramName].filter(
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
