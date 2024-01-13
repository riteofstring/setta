import { useCodeInfo } from "models/info/codeInfo";
import { useUITypes } from "models/info/uiTypes";
import { assembleUITypes, getProjectData } from "./save";
import { terminalWebsocket } from "components/UI/Section/SectionContainer/TerminalArea";

export function getProjectDataToGenerateCode() {
  const project = getProjectData();
  project.codeInfo = useCodeInfo.getState().x;
  const presetUITypes = assembleUITypes(useUITypes.getState().x, true);
  project.uiTypes = { ...project.uiTypes, ...presetUITypes };
  delete project.project.defaultConfigId;
  return project;
}

export function runCode({ codeId }) {
  const project = getProjectDataToGenerateCode();
  terminalWebsocket.send(JSON.stringify({ id: codeId, type: "runCode", message: project }));
}
