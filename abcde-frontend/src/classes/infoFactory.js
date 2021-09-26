import { combineObjects, combineParameters } from "../utils/utils";
import {
  SectionInfo,
  ModuleInfo,
  ObjInfo,
  ParameterInfo,
  convertSpecsToDict,
} from "./jsonParser";

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

function createInfo(infoType, name, jsonInput) {
  const info = new infoType(createNewId(), name, jsonInput);
  return { info, id: info.id };
}

export function createSectionInfo(name, specs, available) {
  const jsonInput = createJson(specs, available);
  const { info, id } = createInfo(SectionInfo, name, jsonInput);
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
  return { info, id };
}
