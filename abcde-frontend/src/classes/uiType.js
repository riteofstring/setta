export class UIType {
  constructor(name, parentUIType = null) {
    this.name = name;
    this.initializeListProps(parentUIType);
    this.initializeConfig(name);
  }

  initializeListProps = (parentUIType) => {
    if (this.name === "LIST_NESTED_OBJECT") {
      this.isList = !!(parentUIType && parentUIType.isListRoot);
      this.isListRoot = !this.isList;
    } else {
      this.isList = false;
      this.isListRoot = false;
    }
  };

  initializeConfig = () => {
    this.config = {}
    // if (this.isNested()){

    // }
  };

  setConfig = (configName, value) => {
    this.config = {...this.config, [configName]: value}
  };

  isNested = () => {
    return ["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(this.name);
  };
}
