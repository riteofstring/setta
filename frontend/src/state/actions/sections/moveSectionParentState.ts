import { deleteNodes } from "state/actions/nodeInternals";
import { useNodeInternals, type ZustandProjectState } from "state/definitions";
import { insertIntoArray } from "utils/utils";

import { setCurrEffectiveSectionImplValue } from "../sectionEffectiveImplMutations";
import { getCurrEffectiveSectionImpl } from "../sectionEffectiveImplSelectors";
import { setSectionChildren } from "../sectionHierarchy";
import { isBaseCodeSectionType } from "../sectionLayoutQueries";
import { isCodeSection, isTerminalSection } from "./moveSectionQueries";

export function moveSectionsIntoParent({
  sectionIds,
  newParentId,
  newIndex,
  state,
}: {
  sectionIds: string[];
  newParentId: string;
  newIndex: number;
  state: ZustandProjectState;
}): void {
  const movingSet = new Set(sectionIds);
  setSectionChildren(state, newParentId, (children) => {
    const nextChildren = children.filter((id) => !movingSet.has(id));
    return insertIntoArray(nextChildren, newIndex, ...sectionIds);
  });
  if (isCodeSection(state, newParentId)) {
    if (sectionIds.length === 1 && isTerminalSection(state, sectionIds[0])) {
      const terminalSectionId = sectionIds[0];
      const parentImpl = getCurrEffectiveSectionImpl(state, newParentId);
      setCurrEffectiveSectionImplValue<"BaseCodeSection">(state, newParentId, {
        attachedTerminalSectionId: terminalSectionId,
      });
      if (
        isBaseCodeSectionType(parentImpl.type) &&
        parentImpl.size.width !== "auto"
      ) {
        setCurrEffectiveSectionImplValue(state, terminalSectionId, {
          size: (currSize) => ({
            ...currSize,
            width: parentImpl.size.width,
          }),
        });
      }
    }
  }
  for (const sectionId of sectionIds) {
    state.parentSectionMap[sectionId] = newParentId;
  }
}

export function removeSectionsFromParents({
  sectionIds,
  parentsById,
  state,
  removeTopLevelNodes,
}: {
  sectionIds: string[];
  parentsById: Record<string, string | null>;
  state: ZustandProjectState;
  removeTopLevelNodes: boolean;
}): void {
  const idsByParent: Record<string, string[]> = {};
  for (const sectionId of sectionIds) {
    const parentId = parentsById[sectionId] ?? null;
    if (!parentId) {
      continue;
    }
    if (!idsByParent[parentId]) {
      idsByParent[parentId] = [];
    }
    idsByParent[parentId].push(sectionId);
  }

  for (const [parentId, ids] of Object.entries(idsByParent)) {
    const removalSet = new Set(ids);
    if (isCodeSection(state, parentId)) {
      const parentImpl = getCurrEffectiveSectionImpl(state, parentId);
      if (
        isBaseCodeSectionType(parentImpl.type) &&
        parentImpl.attachedTerminalSectionId &&
        removalSet.has(parentImpl.attachedTerminalSectionId)
      ) {
        setCurrEffectiveSectionImplValue<"BaseCodeSection">(state, parentId, {
          attachedTerminalSectionId: null,
        });
      }
    }
    setSectionChildren(state, parentId, (children) =>
      children.filter((id) => !removalSet.has(id)),
    );
  }

  if (removeTopLevelNodes && sectionIds.length > 0) {
    // Defensive cleanup: if any of these sections have a top-level node/layout
    // entry, they must be removed when moving into a parent.
    const nodeIdsToDelete = sectionIds.filter((sectionId) =>
      hasNode(sectionId),
    );
    if (nodeIdsToDelete.length > 0) {
      deleteNodes(nodeIdsToDelete);
    }
    for (const sectionId of sectionIds) {
      deleteTopLevelSectionLayout(state, sectionId);
    }
  }
}

function hasNode(sectionId: string): boolean {
  return useNodeInternals.getState().x.has(sectionId);
}

function deleteTopLevelSectionLayout(
  state: ZustandProjectState,
  sectionId: string,
): void {
  delete state.projectConfig.topLevelSections[sectionId];
  for (const viewMode of Object.values(state.projectConfig.viewModes)) {
    if (!viewMode.topLevelSections) {
      continue;
    }
    delete viewMode.topLevelSections[sectionId];
  }
}
