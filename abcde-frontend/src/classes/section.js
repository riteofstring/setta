import { insertIntoArray } from "../utils/utils";
import { createJson } from "./jsonParser";
import { Selected } from "./selected";
import { UIType } from "./uiType";
import { History } from "./history";

export class Section {
  constructor(name, sectionInfo) {
    this.name = name;
    this.sectionInfo = sectionInfo;
    this.parent = null;
    this.selected = new Selected();
    this.uiType = new UIType({ name: "OBJECT" });
    this.history = new History(this.getParameters());
    this.getHistory();
  }

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

  getParamUIType = (paramName) => {
    return this.getParamData(paramName, "uiType");
  };

  getDefaultValue = (paramName) => {
    return this.getParamData(paramName, "defaultVal");
  };

  getParamUITypeConfig = (paramName) => {
    return this.getParamUIType(paramName).config;
  };

  setSelected = (moduleName, objName) => {
    this.setHistory();
    this.selected = new Selected(moduleName, objName);
    this.getHistory();
  };

  setParamUIType = (paramName, uiName) => {
    this.setHistory();
    this.setParamData(paramName, "uiType", new UIType({ name: uiName }));
    this.getHistory();
  };

  setParamUITypeConfig = (paramName, configName, value) => {
    this.getParamUIType(paramName).setConfig(configName, value);
  };

  setSectionModules = (specs, available) => {
    const jsonInput = createJson(specs, available);
    this.sectionInfo.setModuleInfos(jsonInput, available);
  };

  hasNested = () => {
    return this.childrenIds.length > 0;
  };

  addChildren = (childIds, paramName, idx = null) => {
    if (idx === null) {
      this.childrenIds = [...this.childrenIds, ...childIds];
    } else {
      this.childrenIds = insertIntoArray(this.childrenIds, idx, ...childIds);
    }
    this.addToChildrenPerParam(childIds, paramName);
  };

  addToChildrenPerParam = (childIds, paramName) => {
    const curr = this.childrenIdsPerParam[this.selected.asString];
    curr[paramName] = [...curr[paramName], ...childIds];
  };

  deleteFromChildrenPerParam = (childIds, paramName) => {
    const curr = this.childrenIdsPerParam[this.selected.asString];
    curr[paramName] = curr[paramName].filter((x) => !childIds.includes(x));
  };

  deleteChildren = (childIds, paramName) => {
    const key = this.selected.asString;
    this.childrenIds[key] = this.childrenIds[key].filter(
      (x) => !childIds.includes(x)
    );
    this.deleteFromChildrenPerParam(childIds, paramName);
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

  getHistory = () => {
    for (let s of this.history.historyNames()) {
      this[s] = this.history.getHistory(s, this.selected.asString);
    }
  };

  setHistory = () => {
    for (let s of this.history.historyNames()) {
      this.history.setHistory(s, this.selected.asString, this[s]);
    }
  };
}
