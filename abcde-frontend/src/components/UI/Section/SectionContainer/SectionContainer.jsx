import { useDraggable, useDroppable } from "@dnd-kit/core";
import { DECK } from "abcde-utils/src/constants";
import { useDragActivation } from "hooks/useDragActivation";
import { useGetCurrChildren } from "hooks/useSectionChildren";
import { useGetSectionType } from "hooks/useSectionType";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React from "react";
import ManyNestedSections from "../NestedSection/ManyNestedSections";
import SectionTitle from "./Header/Title/SectionTitle";
import SectionContainerCore from "./SectionContainerCore";

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  depth,
  dragListeners,
}) {
  const [sectionType] = useGetSectionType(sectionId, ["type"]);
  const isDeck = sectionType === DECK;
  const currChildren = useGetCurrChildren(sectionId);
  const hasNested = currChildren.length > 0;

  return (
    <Container
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      hasNested={hasNested}
      dragListeners={dragListeners}
      depth={depth}
    >
      {!isDeck && (
        <SectionContainerCore
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          hasNested={hasNested}
        />
      )}

      {hasNested && (
        <div className="flex flex-col">
          <ManyNestedSections
            childIds={currChildren}
            sectionId={sectionId}
            depth={depth}
            isDeck={isDeck}
          />
        </div>
      )}
    </Container>
  );
}
export default React.memo(SectionContainer, (p, n) => {
  return p.nextId === n.nextId;
});

function Container({
  isDeck,
  sectionId,
  parentId,
  dragListeners,
  hasNested,
  depth,
  children,
}) {
  const { setNodeRef: droppableRef } = useDroppable({ id: sectionId });
  const { listeners: topLevelDragListeners, setNodeRef: draggableRef } =
    useDraggable({
      id: sectionId,
      data: { depth },
    });
  const refForPosition = useSetSectionPosition(sectionId);
  const { isSorting, isMovingFree } = useDragActivation();
  const isDraggingSortable = parentId && (isSorting || isMovingFree);
  const isDraggingTopLevel = depth === 0 && isMovingFree;
  let trueDragListeners = {};
  if (isDraggingSortable) {
    trueDragListeners = dragListeners;
  } else if (isDraggingTopLevel) {
    trueDragListeners = topLevelDragListeners;
  }

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = `${isDraggingSortable && "nodrag"} mt-2`;

  function totalRef(e) {
    refForPosition.current = e;
    if (isDeck && !hasNested && !isSorting) {
      droppableRef(e);
    }
    if (depth === 0) {
      draggableRef(e);
    }
  }

  const commonProps = { ref: totalRef, ...trueDragListeners };

  return (
    <>
      {isDeck ? (
        <div
          className={`${className} pt-3 px-8 pb-6 rounded-3xl`}
          style={{ backgroundColor: "hsla(212, 22%, 50%, 0.2)" }}
          {...commonProps}
        >
          <DeckSectionTitle sectionId={sectionId} />
          {children}
        </div>
      ) : (
        <div className={className} {...commonProps}>
          {children}
        </div>
      )}
    </>
  );
}

function DeckSectionTitle({ sectionId }) {
  const titleProps = {
    editing: "nodrag w-[450px] font-bold text-4xl -mb-2 tracking-tighter",

    notEditing:
      "font-heading font-bold text-gray-100 text-4xl -mb-2 tracking-tighter",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}
