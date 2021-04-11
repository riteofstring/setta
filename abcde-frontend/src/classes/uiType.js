export class UIType {
  constructor(name, parentUIType = null) {
    this.name = name;
    if (this.name === "LIST_NESTED_OBJECT") {
      this.isList = !!(parentUIType && parentUIType.isListRoot);
      this.isListRoot = !this.isList;
    } else {
      this.isList = false;
      this.isListRoot = false;
    }
  }

  isNested = () => {
    return ["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(this.name);
  };
}
