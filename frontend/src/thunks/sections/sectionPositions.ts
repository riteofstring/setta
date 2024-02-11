import { useNodeInternals } from "models/info/nodeInternals";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { SectionType } from "z_utils/types/section";

export function setZIndices(inputNodes: SectionType[], incrementVersion) {
  const nodes = inputNodes.filter((x) => x.id);
  const nodeInternals = useNodeInternals.getState().x;
  const excludingInputIds = Array.from(nodeInternals.values()).filter(
    (x) => !nodes.map((x) => x.id).includes(x),
  );

  excludingInputIds.sort((a, b) => a.zIndex - b.zIndex); //sort in increasing order of zindex

  const newValues = new Map(nodeInternals);
  for (let i = 0; i < excludingInputIds.length; i++) {
    const curr = newValues.get(excludingInputIds[i].id);
    curr.zIndex = i;
    curr.tempZIndex = curr.zIndex;
  }
  for (let i = 0; i < nodes.length; i++) {
    if (!nodeInternals.has(nodes[i].id)) {
      continue;
    }
    const curr = newValues.get(nodes[i].id);
    curr.zIndex = i + excludingInputIds.length;
    curr.tempZIndex = curr.zIndex;
  }

  useNodeInternals.setState({ nodeInternals: newValues });

  maybeIncrementProjectStateVersion(incrementVersion);
}
