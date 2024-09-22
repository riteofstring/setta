import {
  computeEVReferences,
  computeInfoToFullName,
} from "components/Utils/CodeMirror/utils";
import C from "constants/constants.json";
import _ from "lodash";
import { dbGetFreeTerminal } from "requests/terminals";
import { sendMessage } from "requests/websocket";
import { useWebsocketConnectionList } from "state/definitions";
import { INITIAL_MESSAGE, TERMINAL_WEBSOCKETS } from "state/hooks/terminal";
import { createNewId } from "utils/idNameCreation";
import { addSectionInEmptySpace } from "../sections/createSections";
import { getProjectData } from "./saveProject";

export function getProjectDataToGenerateCode({ includeEVReferences = true }) {
  const project = getProjectData({});
  if (includeEVReferences) {
    Object.assign(project, computeEVReferences(project));
    project["infoToFullName"] = computeInfoToFullName(project);
  }
  console.log(project);
  return project;
}

export async function runCode() {
  const codeId = createNewId();
  const project = getProjectDataToGenerateCode({ includeEVReferences: false });
  let count = 0;
  for (const projectVariant of getProjectRuns(project)) {
    Object.assign(projectVariant, computeEVReferences(projectVariant));
    projectVariant["infoToFullName"] = computeInfoToFullName(projectVariant);
    let message = {
      id: codeId,
      messageType: C.WS_RUN_CODE,
      content: projectVariant,
    };
    if (useWebsocketConnectionList.getState().connectedTo !== "main") {
      sendMessage(message);
      continue;
    }
    const res = await dbGetFreeTerminal(projectVariant.projectConfig.id);
    if (res.status === 200) {
      const freeTerminalId = res.data;
      message = JSON.stringify(message);
      if (freeTerminalId) {
        TERMINAL_WEBSOCKETS[freeTerminalId].send(message);
      } else {
        const id = createNewId();
        INITIAL_MESSAGE[id] = message;
        addSectionInEmptySpace({
          type: C.TERMINAL,
          inputSectionProps: { id },
          positionOffset: { x: count * 100, y: 0 },
        });
      }
    }
    count += 1;
  }
}

function* getProjectRuns(project) {
  if (_.size(project.runGroups) === 0) {
    const variant = _.cloneDeep(project);
    const keepParamSweeps = [];
    for (const s of Object.values(project.sections)) {
      if (s.paramSweepId && s.paramSweepSectionId) {
        keepParamSweeps.push(s.paramSweepId);
      }
    }
    variant.paramSweeps = _.pick(variant.paramSweeps, keepParamSweeps);
    yield* getProjectVariants(variant);
  } else {
    for (const runGroup of Object.values(project.runGroups)) {
      if (!runGroup.selected || _.size(runGroup.sections) === 0) {
        continue;
      }
      const sectionParamSweepPairs = [];
      for (const [sectionId, paramSweeps] of Object.entries(
        runGroup.sections,
      )) {
        const paramSweepIds = Object.keys(paramSweeps);
        if (paramSweepIds.length === 0) {
          sectionParamSweepPairs.push([{ sectionId, paramSweepId: null }]);
        } else {
          sectionParamSweepPairs.push(
            paramSweepIds.map((paramSweepId) => ({
              sectionId,
              paramSweepId,
            })),
          );
        }
      }

      for (const combo of cartesian(...sectionParamSweepPairs)) {
        const variant = _.cloneDeep(project);
        variant.projectConfig.children = _.pick(
          variant.projectConfig.children,
          combo.map((x) => x.sectionId),
        );
        variant.sections = _.pick(
          variant.sections,
          combo.map((x) => x.sectionId),
        );
        variant.paramSweeps = _.pick(
          variant.paramSweeps,
          combo.filter((x) => x.paramSweepId).map((x) => x.paramSweepId),
        );
        yield* getProjectVariants(variant);
      }
    }
  }
}

function* getProjectVariants(project) {
  const allSweeps = [];
  for (const [paramSweepId, details] of Object.entries(project.paramSweeps)) {
    for (const s of details.sweep) {
      if (s.params.length === 0) {
        allSweeps.push([{ selectedItem: s.selectedItem }]);
      } else {
        for (const paramDetails of s.params) {
          const curr = [];
          for (const value of paramDetails.values) {
            curr.push({
              paramSweepId,
              selectedItem: s.selectedItem,
              paramInfoId: paramDetails.paramInfoId,
              value,
            });
          }
          if (curr.length > 0) {
            allSweeps.push(curr);
          }
        }
      }
    }
  }

  if (allSweeps.length > 0) {
    for (const combo of cartesian(...allSweeps)) {
      const variant = _.cloneDeep(project);
      for (const parts of combo) {
        const { paramSweepId, selectedItem, paramInfoId, value } = parts;
        const forSectionId = Object.values(project.sections).find((x) =>
          x.paramSweepIds.includes(paramSweepId),
        ).id;
        const { variantId: sectionVariantId } = project.sections[forSectionId];
        const sectionVariant = variant.sectionVariants[sectionVariantId];
        sectionVariant.selectedItem = selectedItem;
        sectionVariant.values[paramInfoId].value = value;
      }
      yield variant;
    }
  }

  if (allSweeps.length === 0) {
    yield project;
  }
}

// https://stackoverflow.com/a/44012184
function* cartesian(head, ...tail) {
  const remainder = tail.length ? cartesian(...tail) : [[]];
  for (let r of remainder) for (let h of head) yield [h, ...r];
}
