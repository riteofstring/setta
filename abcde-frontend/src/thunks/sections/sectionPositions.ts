import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { maybeIncrementProjectStateVersion } from "thunks/undo";

export function setPositionState(nodes, incrementVersion) {
  const newValues = {};
  const si = useSectionInfos.getState();
  for (const n of nodes) {
    if (!_.isEqual(si.x[n.id].initialPosition, n.position)) {
      newValues[n.id] = { initialPosition: n.position };
    }
  }

  const positionsChanged = _.size(newValues) > 0;
  if (positionsChanged) {
    si.setSectionInfoAttrObjInput({ newValues });
    maybeIncrementProjectStateVersion(incrementVersion);
  }
  return positionsChanged;
}

export function setZIndices(nodes, incrementVersion) {
  const topLevelIds = new Set(useProjectConfig.getState().children);
  nodes.forEach((n) => topLevelIds.delete(n.id));
  const si = useSectionInfos.getState();
  const topLevelInfos = Object.values(_.pick(si.x, [...topLevelIds]));
  topLevelInfos.sort((a, b) => a.zIndex - b.zIndex); //sort in increasing order of zindex

  const newValues = {};
  for (let i = 0; i < topLevelInfos.length; i++) {
    newValues[topLevelInfos[i].id] = { zIndex: i };
  }
  for (let i = 0; i < nodes.length; i++) {
    newValues[nodes[i].id] = { zIndex: i + topLevelInfos.length };
  }

  si.setSectionInfoAttrObjInput({ newValues });
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setPositionAndZIndices(nodes) {
  const positionsChanged = setPositionState(nodes, false);
  setZIndices(nodes, positionsChanged);
}
