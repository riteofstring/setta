function helperSetSelected(sections, sectionInfo, parentObject) {
  const selected = { sectionId: sectionInfo.id };
  if (parentObject) {
    selected.moduleName = parentObject.parent.name;
    selected.objName = parentObject.name;
  } else {
    selected.moduleName = null;
    selected.objName = null;
  }
  sections.setSelected(selected);
}

function helperSetParamUIType(sections, sectionInfo, paramName, uiName) {
  sections.setParamUIType({ sectionId: sectionInfo.id, paramName, uiName });
}

function helperSetEnteredValue(sections, sectionInfo, paramName, value) {
  sections.setEnteredValue({ sectionId: sectionInfo.id, paramName, value });
}

export function parseChildren(sections, sectionInfo) {
  if (!sectionInfo.children) {
    return;
  }
  console.log("sectionInfo.children", parseUI(sectionInfo.children));
}

export function parseUITypes(sections, sectionInfo) {
  if (!sectionInfo.uiTypes) {
    return;
  }
  const uiTypes = sectionInfo.uiTypes.uiTypes;
  let parentObject = null;
  let paramName = null;
  for (let v of uiTypes) {
    paramName = v.parent.name;
    parentObject = v.parent.parentObject;
    helperSetSelected(sections, sectionInfo, parentObject);
    helperSetParamUIType(sections, sectionInfo, paramName, v.uiType.name);
  }
}

export function parseEnteredValues(sections, sectionInfo) {
  if (!sectionInfo.enteredValues) {
    return;
  }
  const values = sectionInfo.enteredValues.values;
  let parentObject = null;
  let paramName = null;
  for (let v of values) {
    paramName = v.parent.name;
    parentObject = v.parent.parentObject;
    helperSetSelected(sections, sectionInfo, parentObject);
    helperSetParamUIType(sections, sectionInfo, paramName, v.uiType.name);
    helperSetEnteredValue(sections, sectionInfo, paramName, v.value);
  }
}

export function parseSelected(sections, sectionInfo) {
  if (sectionInfo.selected) {
    const s = sectionInfo.selected;
    if (s.module && s.object) {
      sections.setSelected({
        sectionId: sectionInfo.id,
        moduleName: s.module,
        objName: s.object,
      });
    }
  }
}

function parseParameters(parameters) {
  const paramDict = {};
  for (let p of parameters) {
    const paramName = p.name;
    paramDict[paramName] = {};
    paramDict[paramName].defaultVal = p.defaultVal;
    paramDict[paramName].uiType = p.uiType.name;
    paramDict[paramName].type = p.type.name;
    const specs = {};
    for (let key of ["Objects", "Parameters"]) {
      specs[key.toLowerCase()] = p[`specs${key}`].map((e) => e.parent.name);
    }
    paramDict[paramName].specs = specs;
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
      id: s.name,
      objects: s.objects.map((x) => x.name),
      parameters: s.parameters.map((x) => x.name),
      selected: {
        module: s.selectedModule?.name,
        object: s.selectedObject?.name,
      },
      enteredValues: s.enteredValues,
      uiTypes: s.uiTypes,
      children: s.children,
    };
  }
  return UI;
}

export function parseUI(ui) {
  const entireUI = {};
  entireUI["OBJECTS"] = parseAvailableObjects(ui["availableObjects"]);
  entireUI["PARAMETERS"] = parseAvailableParameters(ui["availableParameters"]);
  entireUI["UI"] = parseSections(ui["sections"], ui["sectionPositions"]);
  console.log("UI", entireUI);
  return entireUI;
}
