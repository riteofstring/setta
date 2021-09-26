import { UIType } from "./uiType";

export const convertSpecsToDict = (specs) => {
  if (Array.isArray(specs)) {
    return { objects: specs };
  }
  return specs;
};

export class ParameterInfo {
  constructor(name, jsonInput) {
    this.name = name;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.specs = convertSpecsToDict(jsonInput.specs);
    this.isKwarg = jsonInput.isKwarg;
    this.isHidden = jsonInput.isHidden;
    this.uiType = new UIType({ name: jsonInput.uiType, specs: this.specs });
  }

  shouldHaveNested = () => {
    return (
      this.specs &&
      (this.specs.objects.length > 0 || this.specs.parameters.length > 0)
    );
  };
}

export class ObjInfo {
  constructor(name, jsonInput) {
    this.name = name;
  }
}

export class ModuleInfo {
  constructor(name, jsonInput) {
    this.name = name;
  }
}

export class SectionInfo {
  constructor(name, jsonInput) {
    this.name = name;
  }
}
