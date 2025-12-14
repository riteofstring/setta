import { addNodes, deleteNodes } from "state/actions/nodeInternals";
import { ZustandProjectState } from "state/definitions";
import { Position } from "utils/generatedTypes";
import { insertIntoArray } from "utils/utils";
import { setSectionChildren } from "../sectionInfos";

function moveSections({
  sectionIds,
  oldParentIds,
  newParentIds,
  positions,
  oldParentId,
  newParentId,
  state,
}) {
  for (const [idx, sectionId] of sectionIds.entries()) {
    moveSection({
      oldParentId: oldParentIds ? oldParentIds[sectionId] : oldParentId,
      newParentId: newParentIds ? newParentIds[sectionId] : newParentId,
      oldSectionId: sectionId,
      newSectionId: sectionId,
      newIndex: idx,
      position: positions ? positions[sectionId] : null,
      state,
    });
  }
}

export function moveSection({
  oldParentId,
  newParentId,
  oldSectionId,
  newSectionId,
  newIndex,
  position,
  state,
}: {
  oldParentId: string | null;
  newParentId: string | null;
  oldSectionId: string;
  newSectionId: string;
  newIndex: number | null;
  position: Position | null;
  state: ZustandProjectState;
}) {
  setChildrenAndParent({
    oldParentId,
    newParentId,
    oldSectionId,
    newSectionId,
    newIndex,
    position,
    state,
  });

  // setSectionSizeAfterMove(newParentId, newSectionId, state);
}

function setChildrenAndParent({
  oldParentId,
  newParentId,
  oldSectionId,
  newSectionId,
  newIndex,
  position,
  state,
}: {
  oldParentId: string | null;
  newParentId: string | null;
  oldSectionId: string;
  newSectionId: string;
  newIndex: number | null;
  position: Position | null;
  state: ZustandProjectState;
}) {
  // Remove child from old parent's list
  if (!oldParentId) {
    // This means it was a top level section
    deleteNodes([oldSectionId]);
  } else {
    setSectionChildren(state, oldParentId, (x) =>
      x.filter((y) => y !== oldSectionId),
    );
  }
  if (!newParentId) {
    if (position === null) {
      throw new Error();
    }
    // This means it's becoming a top level section
    addNodes([
      {
        id: newSectionId,
        position,
        zIndex: 0,
        tempZIndex: 0,
        width: null,
        height: null,
      },
    ]);
  } else {
    if (newIndex === null) {
      throw new Error();
    }
    // Add child to new parent's list
    setSectionChildren(state, newParentId, (x) =>
      insertIntoArray(x, newIndex, newSectionId),
    );
  }
}
