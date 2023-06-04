import { DragOverlay } from "@dnd-kit/core";
import { useDndState } from "models/info/dndState";
import { useTrueSectionSize } from "models/sectionRefs";
import React from "react";
import { createPortal } from "react-dom";
import { useStore } from "reactflow";

const DummySection = React.forwardRef(({ sectionId }, ref) => {
  const { width, height } = useTrueSectionSize(sectionId);
  const zoom = useStore((x) => x.transform[2]);
  return (
    <div
      style={{ width: `${width * zoom}px`, height: `${height * zoom}px` }}
      className="rounded-md bg-slate-50/75"
      ref={ref}
    />
  );
});

export const DummyDragOverlay = React.forwardRef((props, ref) => {
  const activeId = useDndState((x) => x.activeId);
  const activeIsTopLevel = useDndState((x) => x.activeIsTopLevel);

  return (
    activeId &&
    !activeIsTopLevel &&
    createPortal(
      <DragOverlay dropAnimation={null}>
        <DummySection sectionId={activeId} ref={ref} />
      </DragOverlay>,
      document.body
    )
  );
});
