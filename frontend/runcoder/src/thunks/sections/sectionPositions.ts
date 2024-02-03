import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { SectionType } from "z_utils/types/section";

export function setPositionState(inputNodes, incrementVersion) {
  const nodes = inputNodes.filter((x) => x.id);
  const newValues = {};
  const pc = useProjectConfig.getState();
  for (const n of nodes) {
    if (!(n.id in pc.children)) {
      continue;
    }
    const position = pc.children[n.id];
    if (position.x !== n.position.x || position.y !== n.position.y) {
      newValues[n.id] = n.position;
    }
  }

  const positionsChanged = _.size(newValues) > 0;
  if (positionsChanged) {
    pc.updatePositions(newValues);
    maybeIncrementProjectStateVersion(incrementVersion);
  }
  return positionsChanged;
}

export function setZIndices(inputNodes: SectionType[], incrementVersion) {
  const nodes = inputNodes.filter((x) => x.id);
  const pc = useProjectConfig.getState();
  const topLevelPositions = _.omit(
    pc.children,
    nodes.map((x) => x.id)
  );
  const posWithIds = _.map(topLevelPositions, (v, k) => ({
    id: k,
    ...v,
  }));
  posWithIds.sort((a, b) => a.zIndex - b.zIndex); //sort in increasing order of zindex

  const newValues = {};
  for (let i = 0; i < posWithIds.length; i++) {
    newValues[posWithIds[i].id] = { zIndex: i };
  }
  for (let i = 0; i < nodes.length; i++) {
    if (!(nodes[i].id in pc.children)) {
      continue;
    }
    newValues[nodes[i].id] = { zIndex: i + posWithIds.length };
  }

  pc.updatePositions(newValues);
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function setPositionAndZIndices(nodes) {
  const positionsChanged = setPositionState(nodes, false);
  setZIndices(nodes, positionsChanged);
}
