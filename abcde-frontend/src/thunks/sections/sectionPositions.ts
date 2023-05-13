import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { maybeIncrementProjectStateVersion } from "thunks/undo";

export function setPositionState(nodes) {
  const newValues = {};
  const si = useSectionInfos.getState();
  for (const n of nodes) {
    if (!_.isEqual(si.x[n.id].initialPosition, n.position)) {
      newValues[n.id] = { initialPosition: n.position };
    }
  }
  if (_.size(newValues) > 0) {
    si.setSectionInfoAttrObjInput({ newValues });
    maybeIncrementProjectStateVersion(true);
  }
}
