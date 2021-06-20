function parseParameters(parameters) {
  const paramDict = {};
  for (let p of parameters) {
    const paramName = p["name"];
    paramDict[paramName] = { ...p };
    delete paramDict[paramName]["name"];
    paramDict[paramName]["uiType"] = paramDict[paramName]["uiType"]["name"];
    paramDict[paramName]["type"] = paramDict[paramName]["type"]["name"];
  }
  return paramDict;
}

export function parseAvailableModules(availableModules) {
  const MODULES = {};
  for (let mc of availableModules) {
    const moduleDict = {};
    for (let m of mc["modules"]) {
      const objectDict = {};
      for (let o of m["objects"]) {
        objectDict[o["name"]] = parseParameters(o["parameters"]);
      }
      moduleDict[m["name"]] = objectDict;
    }
    MODULES[mc["name"]] = { ModuleInfo: moduleDict };
  }
  return MODULES;
}

export function parseAvailableParameters(availableParameters) {
  const PARAMETERS = {};
  for (let pc of availableParameters) {
    PARAMETERS[pc["name"]] = {
      ParameterInfo: parseParameters(pc["parameters"]),
    };
  }
  return PARAMETERS;
}

export function parseSectionPositions(sectionPositions) {
  return [...sectionPositions].sort(function (a, b) {
    return a.position - b.position;
  });
}

export function parseSections(sections) {
  const UI = {};
  for (let s of sections) {
    UI[s["variableName"]] = {
      modules: s["modules"].map(x=>x.name),
      parameters: s["parameters"].map(x=>x.name),
    };
  }
  return UI
}
