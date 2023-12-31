import { dbPasteSections } from "dbRequests/pasteSections";
import { REACT_FLOW_STORE } from "utils/constants";
import { loadSectionIntoState } from "./createSectionOrDeck";

export async function pasteSections() {
  const x = JSON.parse(await navigator.clipboard.readText());
  if (x.copyType === "sections") {
    const res = await dbPasteSections(x.data);
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
}
