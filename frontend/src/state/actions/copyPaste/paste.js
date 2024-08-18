import { dbCreateCopyOfSections } from "requests/pasteSections";
import { REACT_FLOW_STORE } from "utils/constants";
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
    loadSectionIntoState({
      ...res.data,
      topLevelIds: Object.keys(res.data.sections),
      ...REACT_FLOW_STORE.lastPaneClickLocation,
      incrementVersion: true,
    });
  }
}
