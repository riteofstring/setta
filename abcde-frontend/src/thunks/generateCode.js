import { generateCode as generateCodeDb } from "dbRequests/codeGenerator";
import { useAuth } from "models/auth";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { BASE } from "utils/uiTypeConstants";
import { assembleUITypes, getProjectData } from "./save";

export function getProjectDataToGenerateCode() {
  const project = getProjectData();
  project.sectionCurrChildren = useSectionInfos.getState().currChildren;
  const codeInfoState = useCodeInfo.getState();
  const allCodeInfo = {
    ...codeInfoState.allCodeInfo,
    ...project.kwargInfo,
  };
  project.codeInfo = {
    allCodeInfo,
    paramCollections: codeInfoState.paramCollections,
  };
  const baseUITypes = assembleUITypes(
    useUITypes.getState().x,
    (v) => v.presetType === BASE
  );
  project.uiTypes = { ...project.uiTypes, ...baseUITypes };
  delete project.kwargInfo;
  return project;
}

export async function generateCode({ codeId }) {
  const project = getProjectDataToGenerateCode();
  const access_token = useAuth.getState().access_token;
  return await generateCodeDb({ access_token, codeId, project });
}
