import { dbCreateCopyOfSections } from "requests/pasteSections";
import { useMisc } from "state/definitions";
import { loadSectionIntoState } from "../sections/loadSections";

export async function paste() {
  let x;
  try {
    x = JSON.parse(await navigator.clipboard.readText());
  } catch {
    return;
  }
  if (x.copyType === "sections") {
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
      ...useMisc.getState().lastPaneClickLocation,
      incrementVersion: true,
    });
  }
}

function findTopLevelSections(sections, sectionVariants) {
  const allChildren = new Set();
  for (const v of Object.values(sectionVariants)) {
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
