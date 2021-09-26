export const convertSpecsToDict = (specs) => {
  if (Array.isArray(specs)) {
    return { objects: specs };
  }
  return specs;
};

export class ParameterInfo {
  constructor(id, name, jsonInput) {
    this.id = id;
    this.name = name;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.specs = convertSpecsToDict(jsonInput.specs);
    this.isKwarg = jsonInput.isKwarg;
    this.isHidden = jsonInput.isHidden;
  }

  shouldHaveNested = () => {
    return (
      this.specs &&
      (this.specs.objects.length > 0 || this.specs.parameters.length > 0)
    );
  };
}

export class ObjInfo {
  constructor(id, name, jsonInput) {
    this.id = id;
    this.name = name;
  }
}

export class ModuleInfo {
  constructor(id, name, jsonInput) {
    this.id = id;
    this.name = name;
  }
}

export class SectionInfo {
  constructor(id, name, jsonInput, specs) {
    this.id = id;
    this.name = name;
    this.hasModules = "ModuleInfo" in jsonInput;
    this.specs = specs;
  }
}
