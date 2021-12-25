import { DndContext, useDraggable } from "@dnd-kit/core";
import React, { useState } from "react";

const defaultCoordinates = {
  x: 0,
  y: 0,
};

export function DND(props) {
  const [{ translate }, setTranslate] = useState({
    initialTranslate: defaultCoordinates,
    translate: defaultCoordinates,
  });
  const [initialWindowScroll, setInitialWindowScroll] =
    useState(defaultCoordinates);

  const style = {
    transform: `translate(${translate?.x ?? 0}px, ${translate?.y ?? 0}px)`,
  };

  return (
    <DndContext
      onDragStart={() => {
        setInitialWindowScroll({
          x: window.scrollX,
          y: window.scrollY,
        });
      }}
      onDragMove={({ delta }) => {
        setTranslate(({ initialTranslate }) => ({
          initialTranslate,
          translate: {
            x: initialTranslate.x + delta.x - initialWindowScroll.x,
            y: initialTranslate.y + delta.y - initialWindowScroll.y,
          },
        }));
      }}
      onDragEnd={() => {
        setTranslate(({ translate }) => {
          return {
            translate,
            initialTranslate: translate,
          };
        });
        setInitialWindowScroll(defaultCoordinates);
      }}
      onDragCancel={() => {
        setTranslate(({ initialTranslate }) => ({
          translate: initialTranslate,
          initialTranslate,
        }));
        setInitialWindowScroll(defaultCoordinates);
      }}
    >
      <Draggable style={style}>{props.children}</Draggable>
    </DndContext>
  );
}

function Draggable(props) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: "draggable",
  });
  return (
    <div ref={setNodeRef} style={props.style} {...listeners} {...attributes}>
      {props.children}
    </div>
  );
}
