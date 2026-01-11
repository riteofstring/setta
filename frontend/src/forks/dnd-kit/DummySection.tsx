import { DragOverlay, useDragDropManager } from "@dnd-kit/react";
import { useComputed } from "@dnd-kit/react/hooks";
import { useDndState } from "forks/dnd-kit/dndState";
import _ from "lodash";
import { forwardRef } from "react";
import { TbDragDrop } from "react-icons/tb";
import { createPortal } from "react-dom";

export const TempDNDSection = forwardRef<HTMLDivElement, Record<string, never>>(
  ({}, ref) => {
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
          className="flex items-center justify-center rounded-xl bg-setta-100/70 shadow-inner dark:bg-setta-500/60"
          ref={ref}
        >
          <TbDragDrop className="scale-150 text-xl font-black text-setta-50 dark:text-setta-400/70" />
        </div>
        <div className="flex-auto bg-transparent" />
      </>
    );
  },
);

const DummySection = forwardRef<HTMLDivElement, Record<string, never>>(
  ({}, ref) => (
    <div
      style={{ width: "100%", height: "100%" }}
      className="rounded-xl bg-blue-500/90 shadow-lg dark:bg-blue-700/90"
      ref={ref}
    />
  ),
);

export const DummyDragOverlay = forwardRef<
  HTMLDivElement,
  Record<string, never>
>(({}, ref) => {
  const manager = useDragDropManager();
  const isDropped = useComputed(
    () => manager?.dragOperation.status.dropped ?? false,
    [manager],
  ).value;
  const overlayStyle = isDropped ? { opacity: 0 } : undefined;

  return createPortal(
    <DragOverlay style={overlayStyle}>
      <DummySection ref={ref} />
    </DragOverlay>,
    document.body,
  );
});
