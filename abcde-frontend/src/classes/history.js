import { createDefaultNestedDict } from "../utils/utils";

export class History {
  constructor(parameters) {
    this.parameters = parameters;
    this.clearHistory();
  }

  getUITypeName = (paramName) => {
    this.parameters[paramName].uiType.name;
  };

  getHistory = (dataName, selected) => {
    if (!this.isPerParam()) {
      return this[dataName][selected];
    } else {
      const output = {};
      for (let p of Object.keys(this.parameters)) {
        output[p] = this[dataName][selected][p][this.getUITypeName(p)];
      }
      return output;
    }
  };

  setHistory = (dataName, selected, value) => {
    if (!this.isPerParam()) {
      return (this[dataName][selected] = value);
    } else {
      for (let p of Object.keys(value)) {
        this[dataName][selected][p][this.getUITypeName(p)] = value[p];
      }
    }
  };

  isPerParam = (dataName) => {
    return !["childrenIds, childrenAreCollapsed"].includes(dataName);
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
