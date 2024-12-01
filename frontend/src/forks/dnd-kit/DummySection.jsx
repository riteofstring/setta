import { DragOverlay } from "forks/dnd-kit/CustomCore";
import { useDndState } from "forks/dnd-kit/dndState";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import React from "react";

export const TempDNDSection = React.forwardRef(({}, ref) => {
  const { width, height } = useDndState(
    (x) => ({
      width: x.width,
      height: x.height,
    }),
    _.isEqual,
  );

  // The 2nd div (flex-auto) is needed to make dnd work from the right
  return (
    <>
      <div
        style={{ width: `${width}px`, height: `${height}px` }}
        className="rounded-xl bg-setta-300/25"
        ref={ref}
      />
      <div className="flex-auto bg-green-500" />
    </>
  );
});

export const DummySection = React.forwardRef(({}, ref) => {
  const zoom = useReactFlow((x) => x.transform[2]);
  const { width, height } = useDndState(
    (x) => ({
      width: x.width,
      height: x.height,
    }),
    _.isEqual,
  );

  const displayWidth = width * zoom;
  const displayHeight = height * zoom;

  return (
    <div className="flex bg-red-500">
      <div
        style={{
          width: `${displayWidth}px`,
          height: `${displayHeight}px`,
        }}
        className="rounded-xl bg-setta-50/25"
        ref={ref}
      />
    </div>
  );
});

export const DummyDragOverlay = React.forwardRef((props, ref) => {
  const activeId = useDndState((x) => x.activeId);

  return (
    activeId && (
      <DragOverlay dropAnimation={null}>
        <DummySection ref={ref} />
      </DragOverlay>
    )
  );
});
