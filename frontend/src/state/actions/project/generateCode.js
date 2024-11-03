import {
  computeEVReferences,
  computeInfoToFullName,
} from "components/Utils/CodeMirror/utils";
import C from "constants/constants.json";
import _ from "lodash";
import { dbGetFreeTerminal } from "requests/terminals";
import { sendMessage } from "requests/websocket";
import { useWebsocketConnectionList } from "state/definitions";
import {
  addTerminalInitialMessage,
  TERMINAL_WEBSOCKETS,
} from "state/hooks/terminal";
import { createNewId } from "utils/idNameCreation";
import { addSectionInEmptySpace } from "../sections/createSections";
import { getProjectData } from "./saveProject";

export function getProjectDataToGenerateCode({ includeEVReferences = true }) {
  const project = getProjectData({});
  if (includeEVReferences) {
    Object.assign(project, computeEVReferences(project));
    project["infoToFullName"] = computeInfoToFullName(project);
  }
  // console.log(project);
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
        addTerminalInitialMessage(id, message);
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
    for (const [runGroupId, runGroup] of Object.entries(project.runGroups)) {
      if (
        !project.projectConfig.runGroupSelection[runGroupId] ||
        !Object.values(runGroup.sections).some((s) => s.selected)
      ) {
        continue;
      }
      const sectionParamSweepsAndVersions = [];
      for (const [sectionId, sectionDetails] of Object.entries(
        runGroup.sections,
      )) {
        if (!sectionDetails.selected) {
          continue;
        }

        const entries = [];
        for (const [paramSweepId, selected] of Object.entries(
          sectionDetails.paramSweeps,
        )) {
          if (selected) {
            entries.push({
              sectionId,
              paramSweepId,
              versionId: null,
            });
          }
        }
        for (const [versionId, selected] of Object.entries(
          sectionDetails.versions,
        )) {
          if (selected) {
            entries.push({
              sectionId,
              paramSweepId: null,
              versionId,
            });
          }
        }

        if (entries.length === 0) {
          sectionParamSweepsAndVersions.push([
            { sectionId, paramSweepId: null, versionId: null },
          ]);
        } else {
          sectionParamSweepsAndVersions.push(entries);
        }
      }

      for (const combo of cartesian(...sectionParamSweepsAndVersions)) {
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
        for (const c of combo) {
          if (c.versionId) {
            variant.sections[c.sectionId].variantId = c.versionId;
          }
        }
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
        allSweeps.push({
          paramSweepId,
          selectedItem: s.selectedItem,
          paramInfoId: null,
          value: null,
        });
      } else {
        for (const paramDetails of s.params) {
          if (!paramDetails.paramInfoId) {
            continue;
          }
          for (const value of paramDetails.values) {
            if (!value) {
              continue;
            }
            allSweeps.push({
              paramSweepId,
              selectedItem: s.selectedItem,
              paramInfoId: paramDetails.paramInfoId,
              value,
            });
          }
        }
      }
    }
  }

  if (allSweeps.length > 0) {
    for (const combo of generateCombinations(allSweeps)) {
      const variant = _.cloneDeep(project);
      for (const parts of combo) {
        const { paramSweepId, selectedItem, paramInfoId, value } = parts;
        const forSectionId = Object.values(project.sections).find((x) =>
          x.paramSweepIds.includes(paramSweepId),
        ).id;
        const { variantId: sectionVariantId } = project.sections[forSectionId];
        const sectionVariant = variant.sectionVariants[sectionVariantId];
        sectionVariant.selectedItem = selectedItem;
        if (paramInfoId) {
          sectionVariant.values[paramInfoId].value = value;
        }
      }
      yield variant;
    }
  }

  if (allSweeps.length === 0) {
    yield project;
  }
}

function* generateCombinations(objects) {
  // Group objects by paramSweepId
  const groupedByParamSweepId = objects.reduce((acc, obj) => {
    if (!acc[obj.paramSweepId]) {
      acc[obj.paramSweepId] = [];
    }
    acc[obj.paramSweepId].push(obj);
    return acc;
  }, {});

  // Generate all possible combinations
  function* combineGroups(groups, currentCombination = []) {
    if (groups.length === 0) {
      yield currentCombination;
      return;
    }

    const currentGroup = groups[0];
    const remainingGroups = groups.slice(1);

    // Group by selectedItem
    const groupedBySelectedItem = currentGroup.reduce((acc, obj) => {
      const key = obj.selectedItem || "null";
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(obj);
      return acc;
    }, {});

    for (const selectedItemGroup of Object.values(groupedBySelectedItem)) {
      // Create a set of unique paramInfoIds
      const uniqueParamInfoIds = new Set(
        selectedItemGroup.map((obj) => obj.paramInfoId),
      );

      // Generate all combinations of paramInfoIds for this selectedItem
      for (const combination of generateCombinations(
        Array.from(uniqueParamInfoIds),
        selectedItemGroup,
      )) {
        yield* combineGroups(remainingGroups, [
          ...currentCombination,
          ...combination,
        ]);
      }
    }
  }

  // Helper function to generate combinations of paramInfoIds
  function* generateCombinations(paramInfoIds, objects) {
    if (paramInfoIds.length === 0) {
      yield [];
      return;
    }

    const currentParamInfoId = paramInfoIds[0];
    const remainingParamInfoIds = paramInfoIds.slice(1);

    const validObjects = objects.filter(
      (obj) => obj.paramInfoId === currentParamInfoId,
    );

    for (const obj of validObjects) {
      for (const subCombination of generateCombinations(
        remainingParamInfoIds,
        objects,
      )) {
        yield [obj, ...subCombination];
      }
    }
  }

  yield* combineGroups(Object.values(groupedByParamSweepId));
}

function* cartesian(head, ...tail) {
  const remainder = tail.length ? cartesian(...tail) : [[]];
  for (let r of remainder) for (let h of head) yield [h, ...r];
}
