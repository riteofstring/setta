export const UITYPES = [
  "TEXT",
  "SLIDER",
  "NESTED_OBJECT",
  "LIST_NESTED_OBJECT",
  "DICT_NESTED_OBJECT",
];

export function requiresNestedSection(uiTypeName) {
  return ["NESTED_OBJECT", "LIST_NESTED_OBJECT", "DICT_NESTED_OBJECT"].includes(
    uiTypeName
  );
}

function isList(uiTypeName) {
  return ["LIST_NESTED_OBJECT", "DICT_NESTED_OBJECT"].includes(uiTypeName);
}

function requiresKeyInput(uiTypeName) {
  return ["DICT_NESTED_OBJECT"].includes(uiTypeName);
}

export class UIType {
  constructor({ name, datatype, parentUIType }) {
    this.name = name;
    this.initializeListProps(parentUIType);
    this.initializeDictProps();
    this.initializeConfig(datatype);
  }

  initializeListProps = (parentUIType) => {
    if (isList(this.name)) {
      this.isList = !!(parentUIType && parentUIType.isListRoot);
      this.isListRoot = !this.isList;
    } else {
      this.isList = false;
      this.isListRoot = false;
    }
  };

  initializeDictProps = () => {
    this.isDictRoot = requiresKeyInput(this.name) && this.isListRoot;
    this.requiresKeyInput = requiresKeyInput(this.name) && !this.isListRoot;
  };

  initializeConfig = (datatype) => {
    if (datatype && this.isNested()) {
      this.config = { modules: datatype };
    } else {
      this.config = {};
    }
  };

  setConfig = (configName, value) => {
    this.config = { ...this.config, [configName]: value };
  };

  isNested = () => {
    return requiresNestedSection(this.name);
  };
}
