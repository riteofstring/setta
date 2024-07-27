import {
  INITIAL_MESSAGE,
  TERMINAL_WEBSOCKETS,
} from "components/UI/Section/SectionContainer/TerminalArea";
import C from "constants/constants.json";
import _ from "lodash";
import { dbGetFreeTerminal } from "requests/terminals";
import { sendMessage } from "requests/websocket";
import { useCodeInfo } from "state/definitions/codeInfo";
import { useUITypes } from "state/definitions/uiTypes";
import { useWebsocketConnectionList } from "state/definitions/websocketConnectionList";
import {
  computeEVReferences,
  computeInfoToFullName,
} from "utils/CodeMirror/utils";
import { createNewId } from "utils/idNameCreation";
import { getMappedSectionDBSource } from "../getters/sectionInfo";
import { addSectionInEmptySpace } from "./addSection";
import { assembleUITypes, getProjectData } from "./save";

export function getProjectDataToGenerateCode({ includeEVReferences = true }) {
  const project = getProjectData();
  project.codeInfo = useCodeInfo.getState().x;
  const presetUITypes = assembleUITypes(useUITypes.getState().x, true);
  project.uiTypes = { ...project.uiTypes, ...presetUITypes };
  delete project.project.defaultConfigId;
  if (includeEVReferences) {
    computeEVReferences(project);
    computeInfoToFullName(project);
  }
  console.log(project);
  return project;
}

export async function runCode({ codeId }) {
  const project = getProjectDataToGenerateCode({ includeEVReferences: false });
  let count = 0;
  for (const projectVariant of getProjectRuns(project)) {
    computeEVReferences(projectVariant);
    computeInfoToFullName(projectVariant);
    const message = JSON.stringify({
      id: codeId,
      type: "runCode",
      content: projectVariant,
    });
    if (useWebsocketConnectionList.getState().connectedTo !== "main") {
      // TODO unify the sendMessage format with the above message format
      sendMessage({
        content: projectVariant,
        id: codeId,
        messageType: "runCode",
      });
      continue;
    }
    const res = await dbGetFreeTerminal(projectVariant.projectConfig.id);
    if (res.status === 200) {
      const freeTerminalId = res.data;
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
  const versions = [];
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
      } else {
        versions.push({ paramSweepId, evColId: sweep.evColId });
      }
      if (curr.length > 0) {
        allSweeps.push(curr);
      }
    }
  }

  if (allSweeps.length > 0) {
    for (const combo of cartesian(...allSweeps)) {
      const variant = _.cloneDeep(project);
      for (const parts of combo) {
        const { paramSweepId, paramInfoId, value } = parts;
        const forSectionId = Object.values(project.sections).find((x) =>
          x.paramSweepIds.includes(paramSweepId),
        ).id;
        const { evColId } = project.sections[forSectionId];
        const dbSource = getMappedSectionDBSource(forSectionId);
        const evCol = variant.evCols[dbSource][evColId];
        evCol.values[paramInfoId] = value;
      }
      yield variant;
    }
  }

  if (versions.length > 0) {
    for (const version of versions) {
      const variant = _.cloneDeep(project);
      const { paramSweepId, evColId } = version;
      const forSectionId = Object.values(project.sections).find((x) =>
        x.paramSweepIds.includes(paramSweepId),
      ).id;
      variant.sections[forSectionId].evColId = evColId;
      yield variant;
    }
  }

  if (allSweeps.length === 0 && versions.length === 0) {
    yield project;
  }
}

// https://stackoverflow.com/a/44012184
function* cartesian(head, ...tail) {
  const remainder = tail.length ? cartesian(...tail) : [[]];
  for (let r of remainder) for (let h of head) yield [h, ...r];
}
