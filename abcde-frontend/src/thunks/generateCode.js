import { generateCode as generateCodeDb } from "dbRequests/codeGenerator";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { assembleUITypes, getProjectData } from "./save";

export function getProjectDataToGenerateCode() {
  const project = getProjectData();
  project.sectionCurrChildren = _.mapValues(
    useSectionInfos.getState().x,
    (v) => v.currChildren
  );
  const codeInfoState = useCodeInfo.getState();
  const allCodeInfo = {
    ...codeInfoState.allCodeInfo,
    ...project.kwargInfo,
  };
  project.codeInfo = { allCodeInfo };
  const presetUITypes = assembleUITypes(useUITypes.getState().x, true);
  project.uiTypes = { ...project.uiTypes, ...presetUITypes };
  delete project.kwargInfo;
  return project;
}

export async function generateCode({ codeId }) {
  const project = getProjectDataToGenerateCode();
  return await generateCodeDb({ codeId, project });
}
