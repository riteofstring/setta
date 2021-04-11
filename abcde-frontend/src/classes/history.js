import { createDefaultNestedDict, requiresNestedSection } from "../utils/utils";
import { UIType } from "./uiType";

export class History {
  constructor() {
    this.clearHistory();
  }

  getUITypeName = (selected, paramName) => {
    return this.paramUITypeNames[selected][paramName];
  };

  getHistory = (dataName, selected, paramNames) => {
    if (this.isNotPerUIType(dataName)) {
      return this[dataName][selected];
    } else {
      let output = {};
      if (dataName === "childrenIdsPerParam") {
        output = createDefaultNestedDict(1, []);
      }
      for (let p of paramNames) {
        output[p] = this[dataName][selected][p][
          this.getUITypeName(selected, p)
        ];
      }
      return output;
    }
  };

  setHistory = (dataName, selected, value) => {
    const curr = this[dataName];
    if (["paramUITypeNames", "childrenAreCollapsed"].includes(dataName)) {
      curr[selected] = value;
    } else if (dataName === "childrenIds") {
      curr[selected] = curr[selected].filter((x) => !value.includes(x));
      curr[selected] = [...curr[selected], ...value];
    } else {
      for (let p of Object.keys(value)) {
        curr[selected][p][this.getUITypeName(selected, p)] = value[p];
      }
    }
  };

  isNotPerUIType = (dataName) => {
    return ["childrenIds", "childrenAreCollapsed", "paramUITypeNames"].includes(
      dataName
    );
  };

  initializeParamUITypes = (selected, params) => {
    for (let p of Object.keys(params)) {
      const currParam = params[p];
      const newUITypeName =
        currParam.hasNested() && !requiresNestedSection(currParam.uiTypeName)
          ? "NESTED_OBJECT"
          : currParam.uiTypeName;
      if (!this.paramUITypes[selected][p][newUITypeName]) {
        this.paramUITypes[selected][p][newUITypeName] = new UIType({
          name: newUITypeName,
          datatype: currParam.typeDescription,
        });
      }
      this.paramUITypeNames[selected][p] = newUITypeName;
    }
  };

  clearHistory = () => {
    this.enteredValues = createDefaultNestedDict(3, undefined);
    this.childrenIds = createDefaultNestedDict(1, []);
    this.childrenIdsPerParam = createDefaultNestedDict(3, []);
    this.childrenAreCollapsed = createDefaultNestedDict(1, false);
    this.paramUITypes = createDefaultNestedDict(3, undefined);
    this.paramUITypeNames = createDefaultNestedDict(2, undefined);
  };

  historyNames = () => {
    return [
      "enteredValues",
      "childrenIds",
      "childrenIdsPerParam",
      "childrenAreCollapsed",
      "paramUITypes",
      "paramUITypeNames",
    ];
  };
}
