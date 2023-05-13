import { useSectionInfos } from "models/info/sectionInfos";
import { maybeIncrementProjectStateVersion } from "thunks/undo";

export function setPositionState(nodes) {
    console.log("nodes", nodes)
  const newValues = {};
  for (const n of nodes) {
    newValues[n.id] = { initialPosition: n.position };
  }
  useSectionInfos.getState().setSectionInfoAttrObjInput({ newValues });
  maybeIncrementProjectStateVersion(true);
}
