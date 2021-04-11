import { createDefaultNestedDict, insertIntoArray } from "../utils/utils";

export class History {
  constructor(parameters) {
    this.parameters = parameters;
    this.clearHistory();
  }

  getUITypeName = (paramName) => {
    return this.parameters[paramName].uiType.name;
  };

  getHistory = (dataName, selected) => {
    console.log("dataName", dataName, this.isNotPerParam(dataName));
    if (this.isNotPerParam(dataName)) {
      return this[dataName][selected];
    } else {
      const output = {};
      for (let p of Object.keys(this.parameters)) {
        console.log("p", p);
        output[p] = this[dataName][selected][p][this.getUITypeName(p)];
      }
      return output;
    }
  };

  setHistory = (dataName, selected, value) => {
    if (this.isNotPerParam(dataName)) {
      return (this[dataName][selected] = value);
    } else {
      for (let p of Object.keys(value)) {
        this[dataName][selected][p][this.getUITypeName(p)] = value[p];
      }
    }
  };

  isNotPerParam = (dataName) => {
    return ["childrenIds", "childrenAreCollapsed"].includes(dataName);
  };

  clearHistory = () => {
    this.enteredValues = createDefaultNestedDict(2, {});
    this.childrenIds = createDefaultNestedDict(1, []);
    this.childrenIdsPerParam = createDefaultNestedDict(3, []);
    this.childrenAreCollapsed = createDefaultNestedDict(1, false);
  };

  historyNames = () => {
    return [
      "enteredValues",
      "childrenIds",
      "childrenIdsPerParam",
      "childrenAreCollapsed",
    ];
  };
}
