import { generateCode as generateCodeDb } from "dbRequests/codeGenerator";
import { thunk } from "easy-peasy";
import { BASE } from "utils/uiTypeConstants";
import { assembleUITypes, getProjectData } from "./save";

export function getProjectDataToGenerateCode(s) {
  const project = getProjectData(s);
  project.sectionCurrChildren = s.sectionInfos.currChildren;
  const allCodeInfo = { ...s.codeInfo.allCodeInfo, ...project.kwargInfo };
  project.codeInfo = {
    allCodeInfo,
    paramCollections: s.codeInfo.paramCollections,
  };
  const baseUITypes = assembleUITypes(s, (v) => v.presetType === BASE);
  project.uiTypes = { ...project.uiTypes, ...baseUITypes };
  delete project.kwargInfo;
  return project;
}

export const generateCode = thunk(async (actions, payload, helpers) => {
  const { codeId } = payload;
  const s = helpers.getStoreState();
  const project = getProjectDataToGenerateCode(s);
  const access_token = helpers.getStoreState().auth.access_token;
  return await generateCodeDb({ access_token, codeId, project });
});
