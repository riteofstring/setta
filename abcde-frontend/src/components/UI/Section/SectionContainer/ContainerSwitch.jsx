import { useDraggable, useDroppable } from "@dnd-kit/core";
import { DropType, useHighlightDroppable } from "hooks/useDndUtils";
import { useDragActivation } from "hooks/useDragActivation";
import { useSectionRefAndInit } from "hooks/useStateRef";
import _ from "lodash";
import React from "react";
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
    <DndSlotAndDndWatcher
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      dragListeners={dragListeners}
    >
      {children}
    </DndSlotAndDndWatcher>
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
    <DndSlotAndDndWatcher
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      droppableRef={droppableRef}
      draggableRef={draggableRef}
      dragListeners={dragListeners}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}

function _DndSlotAndDndWatcher({ sectionId, children, ...props }) {
  const { className, style, highlight } = useHighlightDroppable(sectionId);
  return (
    <DndSlot highlight={highlight}>
      <DndWatcherAndContainer
        sectionId={sectionId}
        {...props}
        className={className}
        style={style}
      >
        {children}
      </DndWatcherAndContainer>
    </DndSlot>
  );
}

const DndSlotAndDndWatcher = React.memo(_DndSlotAndDndWatcher, _.isEqual);

function _DndWatcherAndContainer({
  parentId,
  dragListeners,
  className,
  children,
  ...props
}) {
  const { isSorting, isMovingFree } = useDragActivation();
  const isDraggingSortable = parentId && (isSorting || isMovingFree);
  const isDraggingTopLevel = !parentId && isMovingFree;
  const trueDragListeners =
    isDraggingSortable || isDraggingTopLevel ? dragListeners : {};

  // Don't want the react-flow node (which contains this child)
  // to move when sorting
  const fullClassName = `${isDraggingSortable ? "nodrag" : ""} ${className}`;

  return (
    <Container
      parentId={parentId}
      trueDragListeners={trueDragListeners}
      className={fullClassName}
      {...props}
    >
      {children}
    </Container>
  );
}

const DndWatcherAndContainer = React.memo(_DndWatcherAndContainer, _.isEqual);

function _Container({
  isDeck,
  sectionId,
  droppableRef,
  draggableRef,
  className,
  style,
  trueDragListeners,
  children,
}) {
  const refForPosition = useSectionRefAndInit(sectionId);

  function totalRef(e) {
    refForPosition.current = e;
    droppableRef && droppableRef(e);
    draggableRef && draggableRef(e);
  }

  const commonProps = { ref: totalRef, ...trueDragListeners };

  if (isDeck) {
    return (
      <div
        className={`${className} rounded-3xl px-8 pt-3 pb-6`}
        style={{
          backgroundColor: "hsla(212, 22%, 50%, 0.2)",
          ...style,
        }}
        {...commonProps}
      >
        <DeckSectionTitle sectionId={sectionId} />
        {children}
      </div>
    );
  }
  return (
    <div className={`${className}`} style={style} {...commonProps}>
      {children}
    </div>
  );
}

const Container = React.memo(_Container, _.isEqual);

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
