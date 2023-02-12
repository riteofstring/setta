import { DragOverlay } from "@dnd-kit/core";
import { useDndState } from "models/info/dndState";
import React from "react";
import { createPortal } from "react-dom";
import { useStore } from "react-flow-renderer";
import { SECTIONWIDTH } from "utils/constants";

const DummySection = React.forwardRef((props, ref) => {
  const zoom = useStore((x) => x.transform[2]);
  return (
    <div
      style={{ width: `${SECTIONWIDTH * zoom}px`, height: `${100 * zoom}px` }}
      className="rounded-md bg-slate-50/75"
      ref={ref}
    />
  );
});

export const DummyDragOverlay = React.forwardRef((props, ref) => {
  const active = useDndState((x) => !!x.active);
  const activeIsTopLevel = useDndState((x) => x.activeIsTopLevel);

  return (
    active &&
    !activeIsTopLevel &&
    createPortal(
      <DragOverlay dropAnimation={null}>
        <DummySection ref={ref} />
      </DragOverlay>,
      document.body
    )
  );
});
