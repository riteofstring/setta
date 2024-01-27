import {
  INITIAL_MESSAGE,
  TERMINAL_WEBSOCKETS,
} from "components/UI/Section/SectionContainer/TerminalArea";
import { dbGetFreeTerminal } from "dbRequests/terminals";
import { useCodeInfo } from "models/info/codeInfo";
import { useUITypes } from "models/info/uiTypes";
import { TERMINAL } from "z_utils/constants";
import { createNewId } from "z_utils/utils";
import { addSectionInEmptySpace } from "./addSectionInEmptySpace";
import { assembleUITypes, getProjectData } from "./save";

export function getProjectDataToGenerateCode() {
  const project = getProjectData();
  project.codeInfo = useCodeInfo.getState().x;
  const presetUITypes = assembleUITypes(useUITypes.getState().x, true);
  project.uiTypes = { ...project.uiTypes, ...presetUITypes };
  delete project.project.defaultConfigId;
  return project;
}

export async function runCode({ codeId }) {
  const project = getProjectDataToGenerateCode();
  const res = await dbGetFreeTerminal();
  if (res.status === 200) {
    const freeTerminalId = res.data;
    const message = JSON.stringify({
      id: codeId,
      type: "runCode",
      message: project,
    });
    if (freeTerminalId) {
      TERMINAL_WEBSOCKETS[freeTerminalId].send(message);
    } else {
      const id = createNewId();
      INITIAL_MESSAGE[id] = message;
      addSectionInEmptySpace({
        type: TERMINAL,
        inputSectionProps: { id },
      });
    }
  }
}
