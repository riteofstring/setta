import { nullOrUndefined, defaultDict, insertIntoArray } from "../utils/utils";
import { Selected } from "./selected";
import { UITypeProps } from "./uiTypeProps";

export class Section {
  constructor(sectionInfo, sectionHeading) {
    this.sectionInfo = sectionInfo;
    this.parent = null;
    this.childrenIds = defaultDict(() => []);
    this.selected = new Selected();
    this.uiTypeProps = new UITypeProps();
    this.hasBeenVisited = {};
    this.childrenAreCollapsed = {};
    this.sectionHeading = sectionHeading;
  }

  getChildrenIds = () => {
    const key = this.selected.asString();
    if (!nullOrUndefined(key)) {
      return this.childrenIds[key];
    }
    return [];
  };

  addChildren = (childIds, idx = null) => {
    const key = this.selected.asString();
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
    const key = this.selected.asString();
    this.childrenIds[key] = this.childrenIds[key].filter(
      (x) => !childIds.includes(x)
    );
  };

  hasNested = () => {
    return this.getChildrenIds().length > 0;
  };

  getChildrenAreCollapsed = () => {
    return this.childrenAreCollapsed[this.selected.asString()];
  };

  setChildrenAreCollapsed = (childrenAreCollapsed) => {
    this.childrenAreCollapsed[this.selected.asString()] = childrenAreCollapsed;
  };

  getHasBeenVisited = () => {
    return this.hasBeenVisited[this.selected.asString()];
  };

  setHasBeenVisited = (hasBeenVisited) => {
    this.hasBeenVisited[this.selected.asString()] = hasBeenVisited;
  };
}
