import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import NestedSection from "./NestedSection";

export default function ManyNestedSections({
  childIds,
  sectionId,
  childSectionInfo,
  available,
  parentControls,
  depth,
  isCollapsed,
  setIdsOverview,
  setIdNames,
  setChildren,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  function handleDragEnd(event) {
    const { active, over } = event;

    if (active.id !== over.id) {
      setChildren((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
        {childIds.map((e, idx) => (
          <NestedSection
            parentId={sectionId}
            sectionId={e}
            nextId={childIds[idx + 1]}
            sectionInfo={childSectionInfo[e]}
            available={available}
            parentControls={parentControls}
            idx={idx}
            key={`Nested-Sec-${e}`}
            depth={depth + 1}
            isCollapsed={isCollapsed}
            setIdsOverview={setIdsOverview}
            setIdNames={setIdNames}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
