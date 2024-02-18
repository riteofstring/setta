import { useNodeInternals } from "models/info/nodeInternals";
import { maybeIncrementProjectStateVersion } from "thunks/undo";

export function setZIndices(sectionIds, incrementVersion) {
  const nodeInternals = useNodeInternals.getState().x;
  const excludingInputIds = Array.from(nodeInternals.values()).filter(
    (x) => !sectionIds.includes(x),
  );

  excludingInputIds.sort((a, b) => a.zIndex - b.zIndex); //sort in increasing order of zindex

  const newValues = new Map(nodeInternals);
  for (let i = 0; i < excludingInputIds.length; i++) {
    const curr = newValues.get(excludingInputIds[i].id);
    curr.zIndex = i;
    curr.tempZIndex = curr.zIndex;
  }
  for (let i = 0; i < sectionIds.length; i++) {
    if (!nodeInternals.has(sectionIds[i])) {
      continue;
    }
    const curr = newValues.get(sectionIds[i]);
    curr.zIndex = i + excludingInputIds.length;
    curr.tempZIndex = curr.zIndex;
  }

  useNodeInternals.setState({ x: newValues });

  console.log("setZIndices", newValues)
  maybeIncrementProjectStateVersion(incrementVersion);
}
