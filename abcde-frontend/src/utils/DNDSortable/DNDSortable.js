import { closestCorners, DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useKeyPress } from "react-flow-renderer";

import { useDNDSensors } from "./useDNDSensors";

export function DNDSortable({ sectionId, items, setItems, ...props }) {
  // const sensors = useDNDSensors();
  // function handleDragEnd(event) {
  //   const { active, over } = event;
  //   console.log("event", event.over.data.current.sortable);

  //   if (active.id !== over.id) {
  //     setItems(updateWithArrayMove(active, over));
  //   }
  // }
  // const { setNodeRef } = useDroppable({
  //   id: sectionId,
  // });

  return (
    // <DndContext
    //   sensors={sensors}
    //   collisionDetection={closestCenter}
    //   onDragEnd={handleDragEnd}
    //   // modifiers={[restrictToVerticalAxis]}
    // >
    // <div ref={setNodeRef}>
    <SortableContext
      id={sectionId}
      items={items}
      strategy={verticalListSortingStrategy}
    >
      {props.children}
    </SortableContext>
    // </div>
    // </DndContext>
  );
}

export function GlobalDndContext(props) {
  // const parentIds = useStoreState(
  //   (x) => _.mapValues(x.sectionInfos.x, (y) => y.parentId),
  //   _.isEqual
  // );

  const sensors = useDNDSensors();
  function handleDragEnd(event) {
    // console.log("handleDragEnd", event);
    // console.log("parentIds", parentIds)
    // const { active, over } = event;
    // if (active.id !== over.id) {
    //   setItems(updateWithArrayMove(active, over));
    // }
  }
  function onDragOver({ active, over }) {
    console.log("active", active?.data?.current?.sortable);
    console.log("over", over?.data?.current?.sortable);
  }

  const sortKeyPressed = useKeyPress("Control");

  const modifiers = sortKeyPressed ? [restrictToVerticalAxis] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
      onDragOver={onDragOver}
      modifiers={modifiers}
    >
      {props.children}
    </DndContext>
  );
}
