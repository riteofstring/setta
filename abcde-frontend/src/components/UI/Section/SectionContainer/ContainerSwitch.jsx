import { useDraggable, useDroppable } from "@dnd-kit/core";
import { DropType, useHighlightDroppable } from "hooks/useDndUtils";
import { useDragActivation } from "hooks/useDragActivation";
import { useSectionRefAndInit } from "hooks/useStateRef";
import _ from "lodash";
import { RiDragDropFill } from "react-icons/ri";
import { SectionTitle } from "./Header/Title/SectionTitle";

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
    highlight,
  } = useHighlightDroppable(sectionId);

  const refForPosition = useSectionRefAndInit(sectionId);
  const { isSorting, isMovingFree } = useDragActivation();
  const isDraggingSortable = parentId && (isSorting || isMovingFree);
  const isDraggingTopLevel = !parentId && isMovingFree;
  const trueDragListeners =
    isDraggingSortable || isDraggingTopLevel ? dragListeners : {};

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const className = `${
    isDraggingSortable ? "nodrag" : ""
  } ${highlightDroppableClassName}`;

  function totalRef(e) {
    refForPosition.current = e;
    droppableRef && droppableRef(e);
    draggableRef && draggableRef(e);
  }

  const commonProps = { ref: totalRef, ...trueDragListeners };
  if (isDeck) {
    return (
      <DndSlot highlight={highlight}>
        <div
          className={`${className} rounded-3xl px-8 pt-3 pb-6`}
          style={{
            backgroundColor: "hsla(212, 22%, 50%, 0.2)",
            ...highlightDroppableStyle,
          }}
          {...commonProps}
        >
          <DeckSectionTitle sectionId={sectionId} />
          {children}
        </div>
      </DndSlot>
    );
  }
  return (
    <DndSlot highlight={highlight}>
      <div
        className={`${className}`}
        style={highlightDroppableStyle}
        {...commonProps}
      >
        {children}
      </div>
    </DndSlot>
  );
}

function DeckSectionTitle({ sectionId }) {
  const titleProps = {
    editing: "nodrag w-[450px] font-bold text-4xl -mb-2 tracking-tighter",

    notEditing:
      "font-heading font-bold text-slate-100 text-4xl -mb-2 tracking-tighter",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}

function DndSlot({ highlight, children }) {
  return (
    <>
      {highlight === DropType.ABOVE && <DndSlotTop />}
      {children}
      {highlight === DropType.BELOW && <DndSlotBottom />}
    </>
  );
}

function DndSlotTop() {
  return (
    <div className="relative flex w-full justify-center">
      <div className="absolute -bottom-6 flex justify-center">
        <DndSlotInner />
      </div>
    </div>
  );
}

function DndSlotBottom() {
  return (
    <div className="relative flex w-full justify-center">
      <div className="absolute -bottom-6 flex justify-center">
        <DndSlotInner />
      </div>
    </div>
  );
}

function DndSlotInner() {
  return (
    <div className="grid h-10 w-72 select-none place-items-center rounded-full font-heading font-bold uppercase tracking-widest text-white shadow-md backdrop-blur-sm transition-opacity [background-color:rgba(37,_99,_235,_0.8)]">
      <div className="flex items-center gap-2">
        <RiDragDropFill />
        Drop
      </div>
    </div>
  );
}
