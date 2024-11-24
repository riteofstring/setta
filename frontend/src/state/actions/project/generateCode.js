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
import { generateParamSweepCombinations } from "./generateParamSweepCombinations";
import { generateSectionParamSweepVersionCombinations } from "./generateSectionParamSweepVersionCombinations";
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

      console.log("sectionParamSweepsAndVersions", sectionParamSweepsAndVersions)

      for (const combo of generateSectionParamSweepVersionCombinations(
        sectionParamSweepsAndVersions,
      )) {
        console.log("combo", combo);
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
    const sectionDetails = runGroupSections[sectionId]?.[variantId];
    console.log("sectionDetails", sectionDetails)
    // is it selected for the given variantId?
    if (!sectionDetails || !sectionDetails.selected) {
      console.log("continuing")
      continue;
    }

    let paramSweepWasAdded = false;
    const currentlySelectedVariantId = project.sections[sectionId].variantId;
    for (const [paramSweepId, selected] of Object.entries(
      sectionDetails.paramSweeps,
    )) {
      if (selected) {
        sectionParamSweepsAndVersions.push({
          sectionId,
          paramSweepId,
          versionId: currentlySelectedVariantId,
          parentVersionId: variantId,
        });
        paramSweepWasAdded = true;
      }
    }

    for (const [versionId, selected] of Object.entries(
      sectionDetails.versions,
    )) {
      console.log("versionId", versionId, selected)
      if (selected) {
        // add the currently selected version if a param sweep wasn't added
        if (versionId !== currentlySelectedVariantId || !paramSweepWasAdded) {
          console.log("adding", sectionId)
          sectionParamSweepsAndVersions.push({
            sectionId,
            paramSweepId: null,
            versionId,
            parentVersionId: variantId,
          });
        }
        const childSectionIds = project.sectionVariants[versionId].children;
        console.log("childSectionIds", childSectionIds)
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
  }

  return sectionParamSweepsAndVersions;
}

function* getProjectVariants(project) {
  const allSweeps = [];
  for (const [paramSweepId, details] of Object.entries(project.paramSweeps)) {
    for (const s of details.sweep) {
      allSweeps.push({ paramSweepId, ...s });
    }
  }

  console.log("allSweeps", allSweeps);
  console.log("generateParamSweepCombinations(allSweeps)", [
    ...generateParamSweepCombinations(allSweeps),
  ]);

  if (allSweeps.length > 0) {
    for (const combo of generateParamSweepCombinations(allSweeps)) {
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
  } else {
    yield project;
  }
}
