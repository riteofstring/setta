import { nullOrUndefined, defaultDict, insertIntoArray } from "../utils/utils";
import { Selected } from "./selected";
import { UITypeProps } from "./uiTypeProps";
import { EnteredValues } from "./enteredValues";

export class Section {
  constructor(sectionInfo, sectionHeading) {
    this.sectionInfo = sectionInfo;
    this.parent = null;
    this.childrenIds = defaultDict(() => []);
    this.selected = new Selected();
    this.enteredValues = new EnteredValues();
    this.uiTypeProps = new UITypeProps();
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
    return this.enteredValues.getValue(this.selected.asString, paramName);
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
    this.enteredValues.setValue(this.selected.asString, paramName, value);
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
    const { moduleName, objName } = this.selected;
    this.sectionInfo.addKwarg(moduleName, objName, paramName);
  };

  getKwargs = () => {
    const { moduleName, objName } = this.selected;
    this.sectionInfo.getKwargs(moduleName, objName);
  };

  getParameters = () => {
    const { moduleName, objName } = this.selected;
    this.sectionInfo.getKwargs(moduleName, objName);
  };
}
