import { KeyboardSensor, PointerSensor } from "@dnd-kit/dom";
import {
  DragDropProvider,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  type DragEndEvent,
} from "forks/dnd-kit/adapter";
import { transformToString } from "forks/dnd-kit/adapter/zoom";
import { useMemo, type CSSProperties } from "react";

type ViewModeSortableProviderProps = {
  id: string;
  items: Array<string>;
  direction: "horizontal" | "vertical";
  onReorder: (activeId: string, overId: string) => void;
  children: React.ReactNode;
};

export function ViewModeSortableProvider({
  id,
  items,
  direction,
  onReorder,
  children,
}: ViewModeSortableProviderProps) {
  if (typeof window === "undefined") {
    return <>{children}</>;
  }

  const sensors = useMemo(
    () => [PointerSensor.configure({}), KeyboardSensor.configure({})],
    [],
  );
  const dndContext = useMemo(
    () => ({
      isMovingFree: false,
      isSorting: false,
    }),
    [],
  );
  const strategy =
    direction === "horizontal"
      ? horizontalListSortingStrategy
      : verticalListSortingStrategy;

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || overId === activeId) {
      return;
    }
    onReorder(activeId, overId);
  }

  return (
    <DragDropProvider
      sensors={sensors}
      dndContext={dndContext}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragEnd}
      debugLabel={id}
    >
      <SortableContext
        id={id}
        items={items}
        strategy={strategy}
        forceSorting
      >
        {children}
      </SortableContext>
    </DragDropProvider>
  );
}

export function useViewModeSortableItem(id: string, disabled: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
      data: {
        type: "view-mode",
      },
      disabled,
    });
  const style: CSSProperties = {
    transform: transformToString(transform),
    transition,
    zIndex: isDragging ? 3 : undefined,
  };
  return {
    attributes,
    listeners,
    setNodeRef,
    style,
    isDragging,
  };
}
