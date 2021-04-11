import { createDefaultNestedDict } from "../utils/utils";

export class History {
  constructor() {
    this.clearHistory();
  }

  getUITypeName = (paramName) => {
    return this.parameters[paramName].uiType.name;
  };

  getHistory = (dataName, selected) => {
    if (this.isNotPerParam(dataName)) {
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
    const curr = this[dataName];
    if (dataName === "childrenAreCollapsed") {
      curr[selected] = value;
    } else if (dataName === "childrenIds") {
      curr[selected] = curr[selected].filter((x) => !value.includes(x));
      curr[selected] = [...curr[selected], ...value];
    } else {
      for (let p of Object.keys(value)) {
        curr[selected][p][this.getUITypeName(p)] = value[p];
      }
    }
  };

  isNotPerParam = (dataName) => {
    return ["childrenIds", "childrenAreCollapsed"].includes(dataName);
  };

  clearHistory = () => {
    this.parameters = {};
    this.enteredValues = createDefaultNestedDict(3, undefined);
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
