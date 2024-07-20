import { pasteSections } from "./pasteSections";

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
