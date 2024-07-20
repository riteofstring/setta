import { dbPasteSections } from "dbRequests/pasteSections";
import { REACT_FLOW_STORE } from "utils/constants";
import { loadSectionIntoState } from "./createSectionOrDeck";

export async function pasteSections(data) {
  const res = await dbPasteSections(data);
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
