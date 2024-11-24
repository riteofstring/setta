import {
  computeEVReferences,
  computeInfoToFullName,
} from "components/Utils/CodeMirror/utils";
import _ from "lodash";
import { createNewId } from "utils/idNameCreation";
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
    // console.log("projectVariant", projectVariant)
    // Object.assign(projectVariant, computeEVReferences(projectVariant));
    // projectVariant["infoToFullName"] = computeInfoToFullName(projectVariant);
    // let message = {
    //   id: codeId,
    //   messageType: C.WS_RUN_CODE,
    //   content: projectVariant,
    // };
    // if (useWebsocketConnectionList.getState().connectedTo !== "main") {
    //   sendMessage(message);
    //   continue;
    // }
    // const res = await dbGetFreeTerminal(projectVariant.projectConfig.id);
    // if (res.status === 200) {
    //   const freeTerminalSectionId = res.data;
    //   message = JSON.stringify(message);
    //   if (freeTerminalSectionId) {
    //     sendTerminalMessage(freeTerminalSectionId, message);
    //   } else {
    //     const id = createNewId();
    //     addTerminalInitialMessage(id, message);
    //     addSectionInEmptySpace({
    //       type: C.TERMINAL,
    //       inputSectionProps: { id, isTemporary: true },
    //       positionOffset: { x: count * 100, y: 0 },
    //     });
    //   }
    // }
    // count += 1;
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
      const sectionParamSweepVersionCombinations =
        getSectionParamSweepVersionCombinations(
          project,
          runGroup.sections,
          Object.keys(project.projectConfig.children),
          null,
        );

      console.log(
        "sectionParamSweepVersionCombinations",
        sectionParamSweepVersionCombinations,
      );
      // for (const combo of generateValidCombinations(
      //   sectionParamSweepsAndVersions,
      // )) {
      //   console.log("combo", combo);
      // const variant = _.cloneDeep(project);
      // // filter top-level sections
      // variant.projectConfig.children = _.pick(
      //   variant.projectConfig.children,
      //   combo.map((x) => x.sectionId),
      // );
      // // filter all sections
      // variant.sections = _.pick(
      //   variant.sections,
      //   combo.map((x) => x.sectionId),
      // );
      // // filter children list in every variant
      // for (const sv of Object.values(variant.sectionVariants)) {
      //   sv.children = sv.children.filter((x) => x in variant.sections);
      // }
      // // filter paramSweeps
      // variant.paramSweeps = _.pick(
      //   variant.paramSweeps,
      //   combo.filter((x) => x.paramSweepId).map((x) => x.paramSweepId),
      // );
      // // set every selected section's variantId
      // for (const c of combo) {
      //   if (c.versionId) {
      //     variant.sections[c.sectionId].variantId = c.versionId;
      //   }
      // }

      // yield* getProjectVariants(variant);
      // yield null;
      // }
    }
  }
}

function getSectionParamSweepVersionCombinations(
  project,
  runGroupSections,
  sectionIds,
  variantId,
) {
  // start by populating combos with the sectionIds
  const combos = sectionIds.filter((s) => {
    const sectionDetails = runGroupSections[s];
    return sectionDetails && sectionDetails.selected[variantId];
  });
  const filteredSectionIds = [...combos];

  for (const sectionId of filteredSectionIds) {
    const sectionDetails = runGroupSections[sectionId];
    const childCombos = [];
    for (const [versionId, selected] of Object.entries(
      sectionDetails.versions,
    )) {
      if (selected) {
        const childSectionIds = project.sectionVariants[versionId].children;
        childCombos.push(
          ...getSectionParamSweepVersionCombinations(
            project,
            runGroupSections,
            childSectionIds,
            versionId,
          ),
        );
      }
    }

    for (const [paramSweepId, selected] of Object.entries(
      sectionDetails.paramSweeps,
    )) {
      if (selected) {
        combos.push({
          sectionId,
          paramSweepId,
          versionId: project.sections[sectionId].variantId,
          parentVersionId: variantId,
        });
      }
    }
  }

  return combos;
}

function* getProjectVariants(project) {
  const paramSweeps = [];
  for (const [paramSweepId, details] of Object.entries(project.paramSweeps)) {
    for (const s of details.sweep) {
      paramSweeps.push({ paramSweepId, ...s });
    }
  }

  console.log("paramSweeps", paramSweeps);

  if (paramSweeps.length === 0) {
    yield project;
  } else {
    for (const combo of generateParamSweepCombinations(paramSweeps)) {
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
}

function* generateParamSweepCombinations(input) {
  // Helper generator function to yield combinations
  function* generateCombos(items, current = []) {
    if (items.length === 0) {
      yield current;
      return;
    }

    const item = items[0];
    const remainingItems = items.slice(1);

    // For each parameter in the current item
    for (const param of item.params) {
      // For each value in the parameter
      for (const value of param.values) {
        const combination = {
          paramSweepId: item.paramSweepId,
          selectedItem: item.selectedItem,
          paramInfoId: param.paramInfoId,
          value: value,
        };

        // Check if this combination is valid with the current set
        const isValid = current.every((existing) => {
          // Check rule: paramSweepId cannot appear with more than one selectedItem
          if (
            existing.paramSweepId === combination.paramSweepId &&
            existing.selectedItem !== combination.selectedItem
          ) {
            return false;
          }

          // Check rule: paramSweepId and selectedItem cannot appear with more than one paramInfoId
          if (
            existing.paramSweepId === combination.paramSweepId &&
            existing.selectedItem === combination.selectedItem &&
            existing.paramInfoId !== combination.paramInfoId
          ) {
            return false;
          }

          return true;
        });

        if (isValid) {
          yield* generateCombos(remainingItems, [...current, combination]);
        }
      }
    }
  }

  yield* generateCombos(input);
}
