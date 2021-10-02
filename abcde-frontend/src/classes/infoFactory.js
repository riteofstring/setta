import { combineObjects, combineParameters } from "../utils/utils";
import {
  SectionInfo,
  ModuleInfo,
  ObjInfo,
  ParameterInfo,
  convertSpecsToDict,
} from "./jsonParser";
import { UIType } from "./uiType";

const { createNewId } = require("../utils/sectionIds");

const getInfos = (jsonInput, factory_fn, key_in_json) => {
  const output = [];
  let info = jsonInput;
  if (key_in_json) {
    info = info[factory_fn.name.replace("create", "")];
  }
  if (info) {
    for (let key of Object.keys(info)) {
      output.push(factory_fn(key, info[key]));
    }
  }
  return output;
};

const createJson = (specs, available) => {
  const sp = convertSpecsToDict(specs);
  let output = {};
  for (let x of [
    ["objects", available.objects, combineObjects],
    ["parameters", available.parameters, combineParameters],
  ]) {
    if (x[0] in sp) {
      output = { ...output, ...x[2](x[1], sp[x[0]]) };
    }
  }
  return output;
};

function createInfo(infoType, name, jsonInput, ...otherArgs) {
  const info = new infoType(createNewId(), name, jsonInput, ...otherArgs);
  return { info, id: info.id };
}

export function createSectionInfo(name, specs, available) {
  const jsonInput = createJson(specs, available);
  const { info, id } = createInfo(SectionInfo, name, jsonInput, specs);
  const moduleInfos = getInfos(jsonInput, createModuleInfo, true);
  const parameterInfos = getInfos(jsonInput, createParameterInfo, true);
  return { info, id, moduleInfos, parameterInfos };
}

export function createModuleInfo(name, jsonInput) {
  const { info, id } = createInfo(ModuleInfo, name, jsonInput);
  const objInfos = getInfos(jsonInput, createObjInfo, false);
  return { info, id, objInfos };
}

export function createObjInfo(name, jsonInput) {
  const { info, id } = createInfo(ObjInfo, name, jsonInput);
  const parameterInfos = getInfos(jsonInput, createParameterInfo, false);
  return { info, id, parameterInfos };
}

export function createParameterInfo(name, jsonInput) {
  const { info, id } = createInfo(ParameterInfo, name, jsonInput);
  const uiType = new UIType({
    id: createNewId(),
    name: jsonInput.uiType,
  });
  return {
    info,
    id,
    uiType,
    config: { id: createNewId(), config: info.specs },
  };
}

export const createAllInfo = (available) => {
  const allModules = createJson(
    Object.keys(available.objects),
    available
  ).ModuleInfo;
  const allParameters = available.parameters;

  const newModuleInfos = {};
  const newModuleObjInfos = {};
  const newObjInfos = {};
  const newObjParamInfos = {};
  const newParamInfos = {};
  const newParamUITypeIds = {};
  const newUITypes = {};
  const newUITypeConfigIds = {};
  const newUITypeConfigs = {};

  for (let m of Object.keys(allModules)) {
    const { info, id, objInfos } = createModuleInfo(m, allModules[m]);
    newModuleInfos[id] = info;
    newModuleObjInfos[id] = objInfos.map((x) => x.id);
    for (let o of objInfos) {
      newObjInfos[o.id] = o.info;
      newObjParamInfos[o.id] = o.parameterInfos.map((x) => x.id);
      for (let p of o.parameterInfos) {
        newParamInfos[p.id] = p.info;
        newParamUITypeIds[p.id] = p.uiType.id;
        newUITypes[p.uiType.id] = p.uiType;
        newUITypeConfigIds[p.uiType.id] = p.config.id;
        newUITypeConfigs[p.config.id] = {
          id: p.config.id,
          ...p.config.config,
        };
      }
    }
  }
  // for (let p of Object.keys(allParameters)) {

  //   const { info, id, uiType, config } = createParameterInfo(
  //     name,
  //     allParameters
  //   );
  //   newParamInfos[p.id] = p.info;
  //   newParamUITypeIds[p.id] = p.uiType.id;
  //   newUITypes[p.uiType.id] = p.uiType;
  //   newUITypeConfigIds[p.uiType.id] = p.config.id;
  //   newUITypeConfigs[p.config.id] = {
  //     id: p.config.id,
  //     ...p.config.config,
  //   };
  // }

  console.log("newModuleInfos", newModuleInfos);
  console.log("newObjInfos", newObjInfos);
  console.log("newParamInfos", newParamInfos);
};
