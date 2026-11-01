import { getNodeInternalsStore, type NodeInternalsState } from "./stores.js";
import { publishNodeInternalsWithTopLevelLayout } from "./topLevelLayoutPublication.js";
import type { WorkspaceHost } from "../workspaceHost.js";

function shouldNormalizeZIndices(
  nodeInternals: NodeInternalsState["x"],
  alwaysNormalize: boolean,
) {
  if (alwaysNormalize) {
    return true;
  }
  let maxZIndex = -1;
  for (const node of nodeInternals.values()) {
    maxZIndex = Math.max(maxZIndex, node.zIndex);
  }
  return maxZIndex > nodeInternals.size * 4;
}

export function normalizeNodeZIndices(
  nodeInternals: NodeInternalsState["x"],
  sectionIds: Array<string>,
) {
  const excludingInputIds = Array.from(nodeInternals.values()).filter(
    (x) => !sectionIds.includes(x.id),
  );
  excludingInputIds.sort((a, b) => a.zIndex - b.zIndex);
  const newValues = new Map(
    Array.from(nodeInternals, ([id, node]) => [id, { ...node }]),
  );
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

function raiseNodeZIndices(
  nodeInternals: NodeInternalsState["x"],
  sectionIds: Array<string>,
) {
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

export function setZIndices(
  host: WorkspaceHost,
  sectionIds: Array<string>,
  alwaysNormalize: boolean = false,
  historyChangeKind: "section-move" | null = null,
): void {
  const nodeStore = getNodeInternalsStore(host);
  const nodeInternals = nodeStore.getState().x;
  const newValues = shouldNormalizeZIndices(nodeInternals, alwaysNormalize)
    ? normalizeNodeZIndices(nodeInternals, sectionIds)
    : raiseNodeZIndices(nodeInternals, sectionIds);
  publishNodeInternalsWithTopLevelLayout(host, newValues, historyChangeKind);
}
