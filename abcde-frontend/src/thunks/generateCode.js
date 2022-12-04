import { generateCode as generateCodeDb } from "dbRequests/codeGenerator";
import { thunk } from "easy-peasy";
import { useAuth } from "models/auth";
import { useCodeInfo } from "models/info/codeInfo";
import { BASE } from "utils/uiTypeConstants";
import { assembleUITypes, getProjectData } from "./save";

export function getProjectDataToGenerateCode(s) {
  const project = getProjectData(s);
  project.sectionCurrChildren = s.sectionInfos.currChildren;
  const codeInfoState = useCodeInfo.getState();
  const allCodeInfo = {
    ...codeInfoState.allCodeInfo,
    ...project.kwargInfo,
  };
  project.codeInfo = {
    allCodeInfo,
    paramCollections: codeInfoState.paramCollections,
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
  const access_token = useAuth.getState().access_token;
  return await generateCodeDb({ access_token, codeId, project });
});
