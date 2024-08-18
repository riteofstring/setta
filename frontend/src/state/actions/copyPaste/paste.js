import { dbCreateCopyOfSections } from "requests/pasteSections";
import { REACT_FLOW_STORE } from "utils/constants";
import { loadSectionIntoState } from "../sections/loadSections";

export async function paste(e) {
  let x;
  try {
    x = JSON.parse(await navigator.clipboard.readText());
  } catch {
    return;
  }
  if (x.copyType === "sections") {
    maybePreventDefault(e);
    // const activeSectionIds = useActiveSection.getState().ids
    // if (activeSectionIds.length > 1 && Object.values(x.data.sections).length === 1) {
    //     for (const id of activeSectionIds){

    //     }

    // } else {

    pasteSections(x.data);
    // }
  }
}

async function pasteSections(data) {
  const res = await dbCreateCopyOfSections(data);
  if (res.status === 200) {
    console.log("res.data", res.data);
    const topLevelIds = findTopLevelSections(
      res.data.sections,
      res.data.sectionVariants,
    );

    loadSectionIntoState({
      ...res.data,
      topLevelIds,
      ...REACT_FLOW_STORE.lastPaneClickLocation,
      incrementVersion: true,
    });
  }
}

function findTopLevelSections(sections, sectionVariants) {
  const allChildren = new Set();
  for (const variants of Object.values(sectionVariants)) {
    for (const v of Object.values(variants)) {
      for (const c of v.children) {
        allChildren.add(c);
      }
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
