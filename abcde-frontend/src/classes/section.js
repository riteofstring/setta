import { insertIntoArray, flattenDictOfArrays } from "../utils/utils";
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
    this.history = new History();
    this.initializeParamUITypes();
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
    return this.paramUITypes[paramName];
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

  setParamSpecs = (paramName, specs) => {
    this.setParamData(paramName, "specs", specs);
  };

  setParamUIType = (paramName, uiName) => {
    this.setHistory();
    this.setParamData(paramName, "uiTypeName", uiName);
    this.setParamData(paramName, "specs", null);
    this.getHistory();
  };

  setParamUITypeConfig = (paramName, configName, value) => {
    this.getParamUIType(paramName).setConfig(configName, value);
  };

  setSectionModules = (specs, available) => {
    const jsonInput = createJson(specs, available);
    this.sectionInfo.setModuleInfos(jsonInput, available);
  };

  addKwarg = (kwargName) => {
    this.setHistory();
    this.sectionInfo.addKwarg(
      this.selected.moduleName,
      this.selected.objName,
      kwargName
    );
    this.getHistory();
  };

  deleteKwarg = (kwargName) => {
    this.setHistory();
    this.sectionInfo.deleteKwarg(
      this.selected.moduleName,
      this.selected.objName,
      kwargName
    );
    this.getHistory();
  };

  replaceKwarg = (oldKwarg, newKwarg) => {
    this.setHistory();
    const alreadyExists = this.sectionInfo.replaceKwarg(
      this.selected.moduleName,
      this.selected.objName,
      oldKwarg,
      newKwarg
    );
    if (!alreadyExists) {
      this.replaceParamName(oldKwarg, newKwarg);
      this.history.replaceParamName(this.selected.asString, oldKwarg, newKwarg);
    }
    this.getHistory();
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
    this.childrenIdsPerParam[paramName] = [
      ...this.childrenIdsPerParam[paramName],
      ...childIds,
    ];
  };

  deleteFromChildrenPerParam = (childIds, paramName) => {
    this.childrenIdsPerParam[paramName] = this.childrenIdsPerParam[
      paramName
    ].filter((x) => !childIds.includes(x));
  };

  deleteChildren = (childIds, paramName) => {
    this.childrenIds = this.childrenIds.filter((x) => !childIds.includes(x));
    this.deleteFromChildrenPerParam(childIds, paramName);
  };

  getKwargs = () => {
    return this.sectionInfo.getParametersAndKwargs(
      this.selected.moduleName,
      this.selected.objName,
      (x) => x.isKwarg && !x.isHidden
    );
  };

  getParameters = () => {
    return this.sectionInfo.getParametersAndKwargs(
      this.selected.moduleName,
      this.selected.objName,
      (x) => !x.isKwarg && !x.isHidden
    );
  };

  getParametersAndKwargs = () => {
    return this.sectionInfo.getParametersAndKwargs(
      this.selected.moduleName,
      this.selected.objName,
      (x) => !x.isHidden
    );
  };

  getHistory = () => {
    const paramNames = Object.keys(this.getParametersAndKwargs());
    this.initializeParamUITypes();
    for (let s of this.history.historyNames()) {
      this[s] = this.history.getHistory(s, this.selected.asString, paramNames);
    }
    this.childrenIds = this.childrenIds.filter((x) =>
      flattenDictOfArrays(this.childrenIdsPerParam).includes(x)
    );
  };

  setHistory = () => {
    for (let s of this.history.historyNames()) {
      this.history.setHistory(s, this.selected.asString, this[s]);
    }
  };

  initializeParamUITypes = () => {
    const parameters = this.getParametersAndKwargs();
    this.history.initializeParamUITypes(this.selected.asString, parameters);
  };

  replaceParamName = (oldParam, newParam) => {
    for (let s of this.history.historyNames()) {
      if (this.history.perParam(s)) {
        this[s][newParam] = this[s][oldParam];
        delete this[s][oldParam];
      }
    }
  };
}
