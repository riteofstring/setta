import { useDndSortableProps } from "hooks/useDndSortableProps";
import { useHighlightDroppable } from "hooks/useDndUtils";
import { useDragActivation } from "hooks/useDragActivation";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import { DeckOrSection } from "./DeckOrSection";

export function NestedSection({
  isDeck,
  sectionId,
  parentId,
  nextId,
  hasNested,
  children,
}) {
  const {
    dragListeners,
    ref: sortableRef,
    style: sortableStyle,
  } = useDndSortableProps(sectionId);
  const refForPosition = useSetSectionPosition(sectionId);
  const { isSorting, isMovingFree } = useDragActivation();
  const inDraggingMode = isSorting || isMovingFree;
  const trueDragListeners = inDraggingMode ? dragListeners : {};

  function totalRef(e) {
    refForPosition.current = e;
    sortableRef(e);
  }

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = inDraggingMode ? "nodrag" : "";
  const dragDropProps = { ref: totalRef, ...trueDragListeners, className };
  const { insertionLineStyle, contextStyle, highlightContext } =
    useHighlightDroppable({
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
      sectionStyle={sortableStyle}
      insertionLineStyle={insertionLineStyle}
      contextStyle={contextStyle}
      dragDropProps={dragDropProps}
    >
      {children}
    </DeckOrSection>
  );
}
