import { combineObjects, combineParameters } from "../utils/utils";
import { SectionInfo, convertSpecsToDict } from "./jsonParser";

const { createNewId } = require("../utils/sectionIds");

export const createJson = (specs, available) => {
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

export function createSectionInfo(name, specs, available) {
  const jsonInput = createJson(specs, available);
  const newInfo = new SectionInfo(name, jsonInput);
  const newInfoId = createNewId();
  return [newInfo, newInfoId];
}
