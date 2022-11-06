import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useHighlightDroppable } from "hooks/useDndUtils";
import { useDragActivation } from "hooks/useDragActivation";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import { DeckOrSection } from "./DeckOrSection";

export function TopLevelSection({
  isDeck,
  sectionId,
  parentId,
  nextId,
  hasNested,
  children,
}) {
  const { setNodeRef: droppableRef } = useDroppable({ id: sectionId });
  const { listeners: topLevelDragListeners, setNodeRef: draggableRef } =
    useDraggable({
      id: sectionId,
      data: { depth: 0 },
    });
  const refForPosition = useSetSectionPosition(sectionId);
  const { isMovingFree } = useDragActivation();
  const trueDragListeners = isMovingFree ? topLevelDragListeners : {};

  function totalRef(e) {
    refForPosition.current = e;
    droppableRef(e);
    draggableRef(e);
  }
  const dragDropProps = { ref: totalRef, ...trueDragListeners };
  const { contextStyle, highlightContext } = useHighlightDroppable({
    sectionId,
    sectionIsSameAsContext: isDeck,
  });

  return (
    <DeckOrSection
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      hasNested={hasNested}
      highlightContext={highlightContext}
      contextStyle={contextStyle}
      dragDropProps={dragDropProps}
    >
      {children}
    </DeckOrSection>
  );
}
