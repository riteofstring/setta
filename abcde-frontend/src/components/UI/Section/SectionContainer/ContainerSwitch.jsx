import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useHighlightDroppable } from "hooks/useDndUtils";
import { useDragActivation } from "hooks/useDragActivation";
import { useSectionRefs } from "models/sectionRefs";
import { useEffect, useRef } from "react";
import SectionTitle from "./Header/Title/SectionTitle";

export function ContainerSwitch({ children, ...props }) {
  return props.depth === 0 ? (
    <ContainerAsDroppableArea {...props}>{children}</ContainerAsDroppableArea>
  ) : (
    <Container {...props}>{children}</Container>
  );
}

function ContainerAsDroppableArea({ children, ...props }) {
  const { setNodeRef: droppableRef } = useDroppable({ id: props.sectionId });
  return (
    <Container droppableRef={droppableRef} {...props}>
      {children}
    </Container>
  );
}

function Container({
  isDeck,
  sectionId,
  parentId,
  dragListeners,
  hasNested,
  depth,
  droppableRef,
  children,
}) {
  const {
    className: highlightDroppableClassName,
    style: highlightDroppableStyle,
  } = useHighlightDroppable(sectionId);
  const { listeners: topLevelDragListeners, setNodeRef: draggableRef } =
    useDraggable({
      id: sectionId,
      data: { depth },
    });
  const refForPosition = useRef(null);
  const { isSorting, isMovingFree } = useDragActivation();
  const isDraggingSortable = parentId && (isSorting || isMovingFree);
  const isDraggingTopLevel = depth === 0 && isMovingFree;
  let trueDragListeners = {};
  if (isDraggingSortable) {
    trueDragListeners = dragListeners;
  } else if (isDraggingTopLevel) {
    trueDragListeners = topLevelDragListeners;
  }
  const setSectionRef = useSectionRefs((x) => x.setRef);

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = `${
    isDraggingSortable && "nodrag"
  } ${highlightDroppableClassName}`;

  function totalRef(e) {
    refForPosition.current = e;
    // if (isDeck && !hasNested && !isSorting) {
    droppableRef && droppableRef(e);
    // }
    if (depth === 0) {
      draggableRef(e);
    }
  }

  const commonProps = { ref: totalRef, ...trueDragListeners };

  useEffect(() => {
    setSectionRef({ sectionId, ref: refForPosition.current });
  }, []);

  return (
    <>
      {isDeck ? (
        <div
          className={`${className} pt-3 px-8 pb-6 rounded-3xl`}
          style={{
            backgroundColor: "hsla(212, 22%, 50%, 0.2)",
            ...highlightDroppableStyle,
          }}
          {...commonProps}
        >
          <DeckSectionTitle sectionId={sectionId} />
          {children}
        </div>
      ) : (
        <div
          className={className}
          style={highlightDroppableStyle}
          {...commonProps}
        >
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
