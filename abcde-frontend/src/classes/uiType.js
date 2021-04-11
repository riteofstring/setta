export class UIType {
  constructor({ name, datatype, parentUIType }) {
    this.name = name;
    this.initializeListProps(parentUIType);
    this.initializeConfig(datatype);
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

  initializeConfig = (datatype) => {
    if (datatype && this.isNested()){
      this.config = {"modules": datatype}
    }
    else{
      this.config = {}
    }
  };

  setConfig = (configName, value) => {
    this.config = { ...this.config, [configName]: value };
  };

  isNested = () => {
    return ["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(this.name);
  };
}
