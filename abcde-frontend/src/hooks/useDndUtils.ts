import { useDndMonitor } from "@dnd-kit/core";
import { useKeyActivations } from "models/keyActivations";
import { useState } from "react";

export function useDisableSortable(sectionId: string, ancestorSet) {
  const [disabled, setDisabled] = useState({
    draggable: false,
    droppable: false,
  });

  function disableSort({ active }) {
    const containerId = active.data.current.sortable?.containerId;
    const { isSorting, isMovingFree } = useKeyActivations.getState();
    // Freely moving this section or ancestor of this section
    if (isMovingFree && (active.id === sectionId || active.id in ancestorSet)) {
      setDisabled({ draggable: true, droppable: true });
    }
    // Freely moving a child of this section
    else if (isMovingFree && containerId === sectionId) {
      setDisabled({ draggable: true, droppable: false });
    }
    // Sorting a child of different section
    else if (isSorting && containerId !== sectionId) {
      setDisabled({ draggable: true, droppable: true });
    }
  }

  function onDragDone() {
    setDisabled({ draggable: false, droppable: false });
  }

  useDndMonitor({
    onDragStart: disableSort,
    onDragEnd: onDragDone,
    onDragCancel: onDragDone,
  });

  return disabled;
}

export function useDndActive() {
  const [active, setActive] = useState(null);
  const onDragStart = ({ active }) => setActive(active);
  const onDragEnd = () => setActive(null);
  return { active, onDragStart, onDragEnd };
}
