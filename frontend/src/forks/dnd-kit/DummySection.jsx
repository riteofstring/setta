import { DragOverlay } from "forks/dnd-kit/CustomCore";
import { useDndState } from "forks/dnd-kit/dndState";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import React from "react";

export const DummySection = React.forwardRef(({ forceShow }, ref) => {
  const zoom = useReactFlow((x) => x.transform[2]);
  const { width, height, highestAncestorWidth } = useDndState(
    (x) => ({
      width: x.width,
      height: x.height,
      highestAncestorWidth: x.highestAncestorWidth[x.overId],
    }),
    _.isEqual,
  );

  const displayWidth = forceShow ? width : width * zoom;
  const displayHeight = forceShow ? height : height * zoom;

  console.log("highestAncestorWidth", highestAncestorWidth);

  return (
    <div className="flex">
      <div
        style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
        className="rounded-md bg-setta-50/25"
        ref={ref}
      />
      {forceShow && highestAncestorWidth && (
        <div
          style={{
            width: `${highestAncestorWidth.width - highestAncestorWidth.depth * 56 - displayWidth}px`,
            height: `${displayHeight}px`,
          }}
          className="invisible"
        />
      )}
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
