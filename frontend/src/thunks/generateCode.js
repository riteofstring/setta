import { generateCode as generateCodeDb } from "dbRequests/codeGenerator";
import { sendMessage } from "dbRequests/websocket";
import { useCodeInfo } from "models/info/codeInfo";
import { useUITypes } from "models/info/uiTypes";
import { assembleUITypes, getProjectData } from "./save";

export function getProjectDataToGenerateCode() {
  const project = getProjectData();
  project.codeInfo = useCodeInfo.getState().x;
  const presetUITypes = assembleUITypes(useUITypes.getState().x, true);
  project.uiTypes = { ...project.uiTypes, ...presetUITypes };
  delete project.project.defaultConfigId;
  return project;
}

export async function generateCode({ codeId }) {
  const project = getProjectDataToGenerateCode();
  return await generateCodeDb({ codeId, project });
}

export function runCode({ codeId }) {
  const project = getProjectDataToGenerateCode();
  sendMessage({ id: codeId, messageType: "runCode", message: project });
}
