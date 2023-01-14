import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useHighlightDroppable } from "hooks/useDndUtils";
import { useDragActivation } from "hooks/useDragActivation";
import _ from "lodash";
import { useSectionRefs } from "models/sectionRefs";
import { useEffect, useRef } from "react";
import SectionTitle from "./Header/Title/SectionTitle";

export function ContainerSwitch({
  isDeck,
  sectionId,
  parentId,
  dragListeners,
  ancestorSet,
  children,
}) {
  return _.size(ancestorSet) === 0 ? (
    <TopLevelContainer
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
    >
      {children}
    </TopLevelContainer>
  ) : (
    <Container
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      dragListeners={dragListeners}
    >
      {children}
    </Container>
  );
}

function TopLevelContainer({ isDeck, sectionId, parentId, children }) {
  const dndProps = {
    id: sectionId,
    data: { isTopLevel: true },
  };
  const { setNodeRef: droppableRef } = useDroppable(dndProps);
  const { listeners: dragListeners, setNodeRef: draggableRef } =
    useDraggable(dndProps);

  return (
    <Container
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      dragListeners={dragListeners}
    >
      {children}
    </Container>
  );
}

function Container({
  isDeck,
  sectionId,
  parentId,
  droppableRef,
  draggableRef,
  dragListeners,
  children,
}) {
  const {
    className: highlightDroppableClassName,
    style: highlightDroppableStyle,
  } = useHighlightDroppable(sectionId);

  const refForPosition = useRef(null);
  const { isSorting, isMovingFree } = useDragActivation();
  const isDraggingSortable = parentId && (isSorting || isMovingFree);
  const isDraggingTopLevel = !parentId && isMovingFree;
  const setSectionRef = useSectionRefs((x) => x.setRef);
  const trueDragListeners =
    isDraggingSortable || isDraggingTopLevel ? dragListeners : {};

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = `${
    isDraggingSortable && "nodrag"
  } ${highlightDroppableClassName}`;

  function totalRef(e) {
    refForPosition.current = e;
    droppableRef && droppableRef(e);
    draggableRef && draggableRef(e);
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
          className={`${className}`}
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
