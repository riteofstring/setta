import { useDndState } from "models/info/dndState";
import { useSectionInfos } from "models/info/sectionInfos";
import { useKeyActivations } from "models/keyActivations";
import { useRef } from "react";
import { useReactFlow } from "react-flow-renderer";
import { moveSection } from "thunks/sections/sectionOps";
import { NAVBAR_HEIGHT, PANEID } from "utils/constants";
import { updateWithArrayMove } from "utils/utils";
import { getDropSubType, getDropType } from "./useDropType";

function onSortEnd({ active, over }) {
  useSectionInfos.getState().setAllChildren({
    sectionId: active.data.current.sortable?.containerId,
    newStateFn: updateWithArrayMove(active, over),
  });
}

function onFreeMoveEnd({ active, over, collisions, dummyRef, project }) {
  const sectionId = active.id;
  const s = useSectionInfos.getState().x;
  const oldParentId = s[sectionId].parentId ? s[sectionId].parentId : PANEID;
  let newParentId = null;
  let newIndex = null;
  let position = null;

  // dropping nested section onto pane
  if (oldParentId !== PANEID && !over) {
    newParentId = PANEID;
    newIndex = 0;
    const { x, y } = dummyRef.current.getBoundingClientRect();
    position = project({ x, y: y - NAVBAR_HEIGHT });
  } else if (over) {
    const dropType = getDropType(active, over, collisions);
    [newParentId, newIndex] = getDropSubType({
      activeId: active.id,
      overId: over.id,
      centerYCondition: useDndState.getState().centerYCondition,
      dropType,
    }).slice(1);
  }

  if (!newParentId) {
    return;
  }

  moveSection({
    oldParentId,
    newParentId,
    sectionId,
    newIndex,
    position,
  });
}

export function useOnDragEnd() {
  const isSorting = useKeyActivations((x) => x.isSorting);
  const isMovingFree = useKeyActivations((x) => x.isMovingFree);
  const { project } = useReactFlow();
  const dummyRef = useRef(null);

  function onDragEnd({ active, over, collisions }) {
    if (isSorting) {
      onSortEnd({ active, over });
    } else if (isMovingFree) {
      onFreeMoveEnd({
        active,
        over,
        collisions,
        dummyRef,
        project,
      });
    }
  }

  return { dummyRef, onDragEnd };
}
