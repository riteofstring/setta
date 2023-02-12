import { useDndState } from "models/info/dndState";
import { useSectionInfos } from "models/info/sectionInfos";
import { useKeyActivations } from "models/keyActivations";
import { useRef } from "react";
import { useReactFlow, useStoreApi } from "react-flow-renderer";
import { moveSection } from "thunks/sections/sectionOps";
import { NAVBAR_HEIGHT, PANEID } from "utils/constants";
import { DropType } from "utils/DNDSortable/dropTypes";
import { updateWithArrayMove } from "utils/utils";
import { getDropType, getSiblingDropType } from "./useDropType";

function onSortEnd({ active, over }) {
  useSectionInfos.getState().setAllChildren({
    sectionId: active.data.current.sortable?.containerId,
    newStateFn: updateWithArrayMove(active, over),
  });
}

function onFreeMoveEnd({
  active,
  over,
  collisions,
  dummyRef,
  project,
  reactFlowStore,
}) {
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
    const zoom = reactFlowStore.getState().transform[2];
    const dropType = getDropType(active, over, collisions, zoom);
    if (dropType === DropType.INTO) {
      newParentId = over.id;
      newIndex = 0;
    } else if (dropType === DropType.AS_SIBLING) {
      newParentId = s[over.id].parentId;
      newIndex = getSiblingDropType({
        activeId: active.id,
        overId: over.id,
        centerYCondition: useDndState.getState().centerYCondition,
        dropType,
      })[1];
    }
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
  const reactFlowStore = useStoreApi();
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
        reactFlowStore,
      });
    }
  }

  return { dummyRef, onDragEnd };
}
