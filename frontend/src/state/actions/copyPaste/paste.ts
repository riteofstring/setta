import { getActiveSectionsBounds } from "forks/xyflow/core/utils/graph";
import { useMisc, useProjectState } from "state/definitions";
import { route_paste_sections } from "utils/generatedEndpoints";
import {
  BaseClipboardDataUnionWithDiscriminator,
  ClipboardDataTypeEnum,
  SectionsClipboardData,
} from "utils/generatedTypes";
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
        asRef,
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



function getPasteLocation() {
  if (useProjectState.getState().projectConfig.activeIds.length === 0) {
    return useMisc.getState().lastPaneClickLocation;
  }
  // paste directly to the right of the active sections
  const { x, y, width } = getActiveSectionsBounds();
  return { x: x + width, y };
}
