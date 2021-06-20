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

export function parseAvailableObjects(availableObjects) {
  const OBJECTS = {};

  for (let oc of availableObjects) {
    const moduleDict = {};
    for (let o of oc.objects) {
      if (!(o.parent.name in moduleDict)) {
        moduleDict[o.parent.name] = {};
      }
      moduleDict[o.parent.name][o.name] = parseParameters(o.parameters);
    }
    OBJECTS[oc.name] = { ModuleInfo: moduleDict };
  }

  return OBJECTS;
}

export function parseAvailableParameters(availableParameters) {
  const PARAMETERS = {};
  for (let pc of availableParameters) {
    PARAMETERS[pc.name] = {
      ParameterInfo: parseParameters(pc.parameters),
    };
  }
  return PARAMETERS;
}

function parseSectionPositions(sectionPositions) {
  const output = {};
  for (let sp of sectionPositions) {
    output[sp.section.name] = sp.position;
  }
  return output;
}

function sortSections(sections, sectionPositions) {
  return [...sections].sort(function (a, b) {
    return (
      sectionPositions[a.name].position - sectionPositions[b.name].position
    );
  });
}

export function parseSections(sections, sectionPositions) {
  const sortedSections = sortSections(
    sections,
    parseSectionPositions(sectionPositions)
  );
  const UI = {};
  for (let s of sortedSections) {
    UI[s["variableName"]] = {
      objects: s["objects"].map((x) => x.name),
      parameters: s["parameters"].map((x) => x.name),
    };
  }
  return UI;
}
