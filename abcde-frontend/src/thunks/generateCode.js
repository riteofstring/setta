import { generateCode as generateCodeDb } from "dbRequests/codeGenerator";
import { useCodeInfo } from "models/info/codeInfo";
import { useUITypes } from "models/info/uiTypes";
import { assembleUITypes, getProjectData } from "./save";

export function getProjectDataToGenerateCode() {
  const project = getProjectData();
  const codeInfoState = useCodeInfo.getState();
  const allCodeInfo = {
    ...codeInfoState.allCodeInfo,
    ...project.kwargInfo,
  };
  project.codeInfo = { allCodeInfo };
  const presetUITypes = assembleUITypes(useUITypes.getState().x, true);
  project.uiTypes = { ...project.uiTypes, ...presetUITypes };
  delete project.kwargInfo;
  delete project.project.defaultConfigId;
  return project;
}

export async function generateCode({ codeId }) {
  const project = getProjectDataToGenerateCode();
  return await generateCodeDb({ codeId, project });
}
