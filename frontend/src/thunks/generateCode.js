import {
  INITIAL_MESSAGE,
  TERMINAL_WEBSOCKETS,
} from "components/UI/Section/SectionContainer/TerminalArea";
import { dbGetFreeTerminal } from "dbRequests/terminals";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { TERMINAL } from "z_utils/constants";
import { createNewId } from "z_utils/utils";
import { addSectionInEmptySpace } from "./addSectionInEmptySpace";
import { assembleUITypes, getProjectData } from "./save";
import { getSectionInfo } from "./sections/getters";

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
  for (const projectVariant of getProjectVariants(project)) {
    const res = await dbGetFreeTerminal();
    if (res.status === 200) {
      const freeTerminalId = res.data;
      const message = JSON.stringify({
        id: codeId,
        type: "runCode",
        message: projectVariant,
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
}

function* getProjectVariants(project) {
  const allSweeps = [];
  for (const [paramSweepId, details] of Object.entries(project.paramSweeps)) {
    for (const sweep of details.sweep) {
      const curr = [];
      if ("paramInfoId" in sweep) {
        for (const value of sweep.values) {
          curr.push({
            paramSweepId,
            paramInfoId: sweep.paramInfoId,
            value,
          });
        }
      }
      allSweeps.push(curr);
    }
  }

  for (const combo of cartesian(...allSweeps)) {
    const variant = _.cloneDeep(project);
    for (const parts of combo) {
      const { paramSweepId, paramInfoId, value } = parts;
      const forSectionId = Object.values(useSectionInfos.getState().x).find(
        (x) => x.paramSweepId === paramSweepId
      ).id;
      const evCol = variant.evCols[getSectionInfo(forSectionId).evColId];
      evCol.values[paramInfoId] = value;
    }
    yield variant;
  }
}

// https://stackoverflow.com/a/44012184
function* cartesian(head, ...tail) {
  const remainder = tail.length ? cartesian(...tail) : [[]];
  for (let r of remainder) for (let h of head) yield [h, ...r];
}
