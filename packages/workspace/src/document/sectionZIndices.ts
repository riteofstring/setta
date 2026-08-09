import _ from "lodash";
import { useNodeInternals, type NodeInternalsState } from "./stores";

function shouldNormalizeZIndices(nodeInternals: NodeInternalsState["x"]) {
  let maxZIndex = -1;
  for (const node of nodeInternals.values()) {
    maxZIndex = Math.max(maxZIndex, node.zIndex);
  }
  return maxZIndex > nodeInternals.size * 4;
}

// Renumbers every node densely: non-target nodes keep their relative order at 0..n-1, then
// each target takes its input-position offset above them (missing targets leave gaps).
function normalizeNodeZIndices(nodeInternals: NodeInternalsState["x"], sectionIds: Array<string>) {
  const excludingInputIds = Array.from(nodeInternals.values()).filter(
    (x) => !sectionIds.includes(x.id),
  );
  excludingInputIds.sort((a, b) => a.zIndex - b.zIndex);
  const newValues = _.cloneDeep(nodeInternals);
  for (const [index, node] of excludingInputIds.entries()) {
    const curr = newValues.get(node.id);
    if (!curr) {
      throw new Error(`Missing node ${node.id} during z-index normalization.`);
    }
    curr.zIndex = index;
    curr.tempZIndex = curr.zIndex;
  }
  for (const [index, sectionId] of sectionIds.entries()) {
    const curr = newValues.get(sectionId);
    if (!curr) {
      continue;
    }
    curr.zIndex = index + excludingInputIds.length;
    curr.tempZIndex = curr.zIndex;
  }
  return newValues;
}

function raiseNodeZIndices(nodeInternals: NodeInternalsState["x"], sectionIds: Array<string>) {
  let maxZIndex = -1;
  for (const node of nodeInternals.values()) {
    maxZIndex = Math.max(maxZIndex, node.zIndex);
  }
  let nextZIndex = maxZIndex;
  let changed = false;
  const newValues = new Map(nodeInternals);
  for (const sectionId of sectionIds) {
    const curr = nodeInternals.get(sectionId);
    if (!curr) {
      continue;
    }
    nextZIndex += 1;
    if (curr.zIndex === nextZIndex && curr.tempZIndex === nextZIndex) {
      continue;
    }
    newValues.set(sectionId, {
      ...curr,
      zIndex: nextZIndex,
      tempZIndex: nextZIndex,
    });
    changed = true;
  }
  return changed ? newValues : nodeInternals;
}

export function setZIndices(sectionIds: Array<string>) {
  const nodeInternals = useNodeInternals.getState().x;
  const newValues = shouldNormalizeZIndices(nodeInternals)
    ? normalizeNodeZIndices(nodeInternals, sectionIds)
    : raiseNodeZIndices(nodeInternals, sectionIds);
  if (newValues !== nodeInternals) {
    useNodeInternals.setState({ x: newValues });
  }
}
