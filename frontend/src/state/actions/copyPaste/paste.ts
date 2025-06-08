import { getActiveSectionsBounds } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { dbCreateCopyOfSections } from "requests/pasteSections";
import { useMisc, useProjectState } from "state/definitions";
import { UITypeNameSchema } from "utils/generatedTypes";
import { addTemporaryNotification } from "../notifications";
import { loadSectionIntoState } from "../sections/loadSections";

export async function paste(props) {
  let x;
  try {
    x = JSON.parse(await navigator.clipboard.readText());
  } catch {
    return;
  }
  if (x.copyType === "sections") {
    pasteSections({ data: x.data, ...props });
  }
}

async function pasteSections({ data, asRef = false }) {
  let dataToPaste;
  if (asRef) {
    dataToPaste = data;
  } else {
    const res = await dbCreateCopyOfSections(data);
    if (res.status === 200) {
      dataToPaste = res.data;
    }
  }
  if (dataToPaste) {
    dataToPaste.sections = removeSingletonSectionsIfAlreadyPresent(dataToPaste);
    const topLevelIds = findTopLevelSections(
      dataToPaste.sections,
      dataToPaste.variants,
    );

    loadSectionIntoState({
      ...dataToPaste,
      topLevelIds,
      ...getPasteLocation(),
      incrementVersion: true,
    });
  }
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

  const { [UITypeNameSchema.enum.GLOBAL_VARIABLES]: globalVariables } =
    useProjectState.getState().singletonSections;
  if (!globalVariables) {
    return sections;
  }

  const toRemove = [];

  for (const s of Object.values(sections)) {
    const uiTypeName = uiTypes[s.uiTypeId].type;
    if (
      globalVariables &&
      uiTypeName === UITypeNameSchema.enum.GLOBAL_VARIABLES
    ) {
      toRemove.push(s.id);
      addTemporaryNotification("Can't have more than 1 global section!");
    }
  }

  return _.omit(sections, toRemove);
}

function getPasteLocation() {
  if (useProjectState.getState().activeIds.length === 0) {
    return useMisc.getState().lastPaneClickLocation;
  }
  // paste directly to the right of the active sections
  const { x, y, width } = getActiveSectionsBounds();
  return { x: x + width, y };
}
