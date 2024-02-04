import { REACT_FLOW_STORE } from "utils/constants";
import { SectionType } from "z_utils/types/section";

export function setZIndices(inputNodes: SectionType[], incrementVersion) {
  const nodes = inputNodes.filter((x) => x.id);
  const nodeInternals = REACT_FLOW_STORE.store.getState().nodeInternals;
  const excludingInputIds = Array.from(nodeInternals.values()).filter(
    (x) => !nodes.map((x) => x.id).includes(x),
  );

  excludingInputIds.sort((a, b) => a.zIndex - b.zIndex); //sort in increasing order of zindex

  const newValues = new Map(nodeInternals);
  for (let i = 0; i < excludingInputIds.length; i++) {
    newValues.get(excludingInputIds[i].id).zIndex = i;
  }
  for (let i = 0; i < nodes.length; i++) {
    if (!nodeInternals.has(nodes[i].id)) {
      continue;
    }
    newValues.get(nodes[i].id).zIndex = i + excludingInputIds.length;
  }

  REACT_FLOW_STORE.store.setState({ nodeInternals: newValues });

  // maybeIncrementProjectStateVersion(incrementVersion);
}
