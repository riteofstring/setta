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
  sendTerminalMessage,
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
      const freeTerminalSectionId = res.data;
      message = JSON.stringify(message);
      if (freeTerminalSectionId) {
        sendTerminalMessage(freeTerminalSectionId, message);
      } else {
        const id = createNewId();
        addTerminalInitialMessage(id, message);
        addSectionInEmptySpace({
          type: C.TERMINAL,
          inputSectionProps: { id, isTemporary: true },
          positionOffset: { x: count * 100, y: 0 },
        });
      }
    }
    count += 1;
  }
}

function* getProjectRuns(project) {
  // if there are no run groups, or no run groups are selected
  if (
    _.size(project.runGroups) === 0 ||
    !Object.values(project.projectConfig.runGroupSelection).some((x) => x)
  ) {
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
      if (!project.projectConfig.runGroupSelection[runGroupId]) {
        continue;
      }
      const sectionParamSweepsAndVersions = getSectionsParamSweepsAndVersions(
        project,
        runGroup.sections,
        Object.keys(project.projectConfig.children),
        null,
      );

      for (const combo of generateValidCombinations(
        sectionParamSweepsAndVersions,
      )) {
        const variant = _.cloneDeep(project);
        // filter top-level sections
        variant.projectConfig.children = _.pick(
          variant.projectConfig.children,
          combo.map((x) => x.sectionId),
        );
        // filter all sections
        variant.sections = _.pick(
          variant.sections,
          combo.map((x) => x.sectionId),
        );
        // filter children list in every variant
        for (const sv of Object.values(variant.sectionVariants)) {
          sv.children = sv.children.filter((x) => x in variant.sections);
        }
        // filter paramSweeps
        variant.paramSweeps = _.pick(
          variant.paramSweeps,
          combo.filter((x) => x.paramSweepId).map((x) => x.paramSweepId),
        );
        // set every selected section's variantId
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

function getSectionsParamSweepsAndVersions(
  project,
  runGroupSections,
  sectionIds,
  variantId,
) {
  const sectionParamSweepsAndVersions = [];
  for (const sectionId of sectionIds) {
    const sectionDetails = runGroupSections[sectionId];
    console.log("sectionDetails", sectionDetails);
    // is it selected for the given variantId?
    if (!sectionDetails || !sectionDetails.selected[variantId]) {
      continue;
    }

    for (const [paramSweepId, selected] of Object.entries(
      sectionDetails.paramSweeps,
    )) {
      if (selected) {
        sectionParamSweepsAndVersions.push({
          sectionId,
          paramSweepId,
          versionId: null,
          parentVersionId: variantId,
        });
      }
    }
    for (const [versionId, selected] of Object.entries(
      sectionDetails.versions,
    )) {
      if (selected) {
        sectionParamSweepsAndVersions.push({
          sectionId,
          paramSweepId: null,
          versionId,
          parentVersionId: variantId,
        });
      }

      const childSectionIds = project.sectionVariants[versionId].children;
      sectionParamSweepsAndVersions.push(
        ...getSectionsParamSweepsAndVersions(
          project,
          runGroupSections,
          childSectionIds,
          versionId,
        ),
      );
    }
  }

  return sectionParamSweepsAndVersions;
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

function generateValidCombinations(objects) {
  // Input validation
  if (!Array.isArray(objects) || objects.length === 0) {
    return [];
  }

  // Helper function to check if an object can be included in a combination
  function canIncludeObject(obj, currentCombination) {
    if (!obj || typeof obj !== "object") return false;

    // If parentVersionId is null, it can always be included
    if (obj.parentVersionId === null) {
      return true;
    }

    // Check if there's an object in the combination with matching versionId
    return currentCombination.some(
      (item) => item.versionId === obj.parentVersionId,
    );
  }

  // Helper function to get all valid objects that can be added to current combination
  function getValidNextObjects(currentCombination, remainingObjects) {
    if (
      !Array.isArray(currentCombination) ||
      !Array.isArray(remainingObjects)
    ) {
      return [];
    }

    return remainingObjects.filter(
      (obj) =>
        obj &&
        !currentCombination.some((item) => item.sectionId === obj.sectionId) &&
        canIncludeObject(obj, currentCombination),
    );
  }

  // Helper function to create a unique key for a combination
  function getCombinationKey(combination) {
    return combination
      .map((obj) => obj.id)
      .sort((a, b) => a - b)
      .join(",");
  }

  // Helper function to recursively build combinations
  function buildCombinations(
    currentCombination,
    remainingObjects,
    uniqueCombinations,
  ) {
    // Validate inputs
    if (
      !Array.isArray(currentCombination) ||
      !Array.isArray(remainingObjects)
    ) {
      return;
    }

    // Get all valid objects that can be added
    const validNextObjects = getValidNextObjects(
      currentCombination,
      remainingObjects,
    );

    // If no more valid objects can be added, this combination is complete
    if (validNextObjects.length === 0) {
      if (currentCombination.length > 0) {
        const key = getCombinationKey(currentCombination);
        uniqueCombinations.set(key, [...currentCombination]);
      }
      return;
    }

    // Try adding each valid object
    for (const obj of validNextObjects) {
      currentCombination.push(obj);
      const newRemaining = remainingObjects.filter((item) => item !== obj);
      buildCombinations(currentCombination, newRemaining, uniqueCombinations);
      currentCombination.pop();
    }

    // Store the current combination if it's not empty
    if (currentCombination.length > 0) {
      const key = getCombinationKey(currentCombination);
      uniqueCombinations.set(key, [...currentCombination]);
    }
  }

  const uniqueCombinations = new Map();
  buildCombinations([], objects, uniqueCombinations);

  // Handle case where no valid combinations were found
  if (uniqueCombinations.size === 0) {
    return [];
  }

  // Convert Map values to array and sort by length
  const combinations = Array.from(uniqueCombinations.values()).sort(
    (a, b) => b.length - a.length,
  );

  // Keep only the combinations with maximum length
  const maxLength = combinations[0].length;
  return combinations.filter((combo) => combo.length === maxLength);
}
