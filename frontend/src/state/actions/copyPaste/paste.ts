import { getActiveSectionsBounds } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { useMisc, useProjectState } from "state/definitions";
import { route_paste_sections } from "utils/generatedEndpoints";
import {
  BaseClipboardDataUnionWithDiscriminator,
  ClipboardDataTypeEnum,
  SectionsClipboardData,
} from "utils/generatedTypes";
import { addTemporaryNotification } from "../notifications";
import { getCurrProjectConfigId } from "../sectionInfos";

export async function paste({ asRef = false }) {
  let x: BaseClipboardDataUnionWithDiscriminator;
  try {
    x = JSON.parse(await navigator.clipboard.readText());
  } catch {
    return;
  }
  switch (x.type) {
    case ClipboardDataTypeEnum.Sections:
      return route_paste_sections({
        projectConfigId: getCurrProjectConfigId(),
        data: x.data,
        position: getPasteLocation(),
      });
    default:
      return x.type satisfies never;
  }
}

async function pasteSections(
  data: SectionsClipboardData["data"],
  asRef: boolean,
) {
  console.log("pasteSections", data, asRef);

  // let dataToPaste;
  // if (asRef) {
  //   dataToPaste = data;
  // } else {
  //   const res = await route_sections_make_copy(data);
  //   if (res200(res)) {
  //     dataToPaste = res.data;
  //   }
  // }
  // if (dataToPaste) {
  //   dataToPaste.sections = removeSingletonSectionsIfAlreadyPresent(dataToPaste);
  //   const topLevelIds = findTopLevelSections(
  //     dataToPaste.sections,
  //     dataToPaste.variants,
  //   );
  //   loadSectionIntoState({
  //     ...dataToPaste,
  //     topLevelIds,
  //     ...getPasteLocation(),
  //     incrementVersion: true,
  //   });
  // }
}

function findTopLevelSections(sections, variants) {
  const allChildren = new Set();
  for (const v of Object.values(variants)) {
    for (const c of v.children) {
      allChildren.add(c);
    }
  }

  const topLevelIds = [];
  for (const id of Object.keys(sections)) {
    if (!allChildren.has(id)) {
      topLevelIds.push(id);
    }
  }
  return topLevelIds;
}

function removeSingletonSectionsIfAlreadyPresent(pasteData) {
  const { sections, uiTypes } = pasteData;

  const { [UITypeNameEnum.GLOBAL_VARIABLES]: globalVariables } =
    useProjectState.getState().singletonSections;
  if (!globalVariables) {
    return sections;
  }

  const toRemove = [];

  for (const s of Object.values(sections)) {
    const uiTypeName = uiTypes[s.uiTypeId].type;
    if (globalVariables && uiTypeName === UITypeNameEnum.GLOBAL_VARIABLES) {
      toRemove.push(s.id);
      addTemporaryNotification("Can't have more than 1 global section!");
    }
  }

  return _.omit(sections, toRemove);
}

function getPasteLocation() {
  if (useProjectState.getState().projectConfig.activeIds.length === 0) {
    return useMisc.getState().lastPaneClickLocation;
  }
  // paste directly to the right of the active sections
  const { x, y, width } = getActiveSectionsBounds();
  return { x: x + width, y };
}
