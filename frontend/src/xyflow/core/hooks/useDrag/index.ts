import { drag } from "d3-drag";
import { select } from "d3-selection";
import type { MouseEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { useStoreApi } from "../../hooks/useStore";
import type { NodeDragItem, UseDragEvent, XYPosition } from "../../types";
import { calcAutoPan, getEventPosition } from "../../utils";
import useGetPointerPosition from "../useGetPointerPosition";
import { getDragItems, hasSelector } from "./utils";

export type UseDragData = { dx: number; dy: number };

type UseDragParams = {
  nodeRef: RefObject<Element>;
  disabled?: boolean;
  noDragClassName?: string;
  nodeId?: string;
  isSelectable?: boolean;
  selectNodesOnDrag?: boolean;
};

function useDrag({
  nodeRef,
  disabled = false,
  noDragClassName,
  nodeId,
  isSelectable,
  selectNodesOnDrag,
}: UseDragParams) {
  const store = useStoreApi();
  const [dragging, setDragging] = useState<boolean>(false);
  const dragItems = useRef<NodeDragItem[]>([]);
  const lastPos = useRef<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const autoPanId = useRef(0);
  const containerBounds = useRef<DOMRect | null>(null);
  const mousePosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragEvent = useRef<MouseEvent | null>(null);
  const autoPanStarted = useRef(false);
  const dragStarted = useRef(false);

  const getPointerPosition = useGetPointerPosition();

  useEffect(() => {
    if (nodeRef?.current) {
      const selection = select(nodeRef.current);

      const updateNodes = ({ x, y }: XYPosition) => {
        const { updateNodePositions, snapGrid, snapToGrid } = store.getState();

        lastPos.current = { x, y };

        let hasChange = false;

        dragItems.current = dragItems.current.map((n) => {
          const nextPosition = { x: x - n.distance.x, y: y - n.distance.y };

          if (snapToGrid) {
            nextPosition.x =
              snapGrid[0] * Math.round(nextPosition.x / snapGrid[0]);
            nextPosition.y =
              snapGrid[1] * Math.round(nextPosition.y / snapGrid[1]);
          }

          // we want to make sure that we only fire a change event when there is a change
          hasChange =
            hasChange ||
            n.position.x !== nextPosition.x ||
            n.position.y !== nextPosition.y;

          n.position = nextPosition;

          return n;
        });

        if (!hasChange) {
          return;
        }

        updateNodePositions(dragItems.current, true, true);
        setDragging(true);
      };

      const autoPan = (): void => {
        if (!containerBounds.current) {
          return;
        }

        const [xMovement, yMovement] = calcAutoPan(
          mousePosition.current,
          containerBounds.current,
        );

        if (xMovement !== 0 || yMovement !== 0) {
          const { transform, panBy } = store.getState();

          lastPos.current.x =
            (lastPos.current.x ?? 0) - xMovement / transform[2];
          lastPos.current.y =
            (lastPos.current.y ?? 0) - yMovement / transform[2];

          if (panBy({ x: xMovement, y: yMovement })) {
            updateNodes(lastPos.current as XYPosition);
          }
        }
        autoPanId.current = requestAnimationFrame(autoPan);
      };

      const startDrag = (event: UseDragEvent) => {
        const {
          nodeInternals,
          multiSelectionActive,
          nodesDraggable,
          unselectNodesAndEdges,
        } = store.getState();
        dragStarted.current = true;

        if (
          (!selectNodesOnDrag || !isSelectable) &&
          !multiSelectionActive &&
          nodeId
        ) {
          if (!nodeInternals.get(nodeId)?.selected) {
            // we need to reset selected nodes when selectNodesOnDrag=false
            unselectNodesAndEdges();
          }
        }

        const pointerPos = getPointerPosition(event);
        lastPos.current = pointerPos;
        dragItems.current = getDragItems(
          nodeInternals,
          nodesDraggable,
          pointerPos,
          nodeId,
        );
      };

      if (disabled) {
        selection.on(".drag", null);
      } else {
        const dragHandler = drag()
          .on("start", (event: UseDragEvent) => {
            const { domNode, nodeDragThreshold } = store.getState();
            if (nodeDragThreshold === 0) {
              startDrag(event);
            }

            const pointerPos = getPointerPosition(event);
            lastPos.current = pointerPos;
            containerBounds.current = domNode?.getBoundingClientRect() || null;
            mousePosition.current = getEventPosition(
              event.sourceEvent,
              containerBounds.current!,
            );
          })
          .on("drag", (event: UseDragEvent) => {
            const pointerPos = getPointerPosition(event);
            const { autoPanOnNodeDrag, nodeDragThreshold } = store.getState();

            if (
              !autoPanStarted.current &&
              dragStarted.current &&
              autoPanOnNodeDrag
            ) {
              autoPanStarted.current = true;
              autoPan();
            }

            if (!dragStarted.current) {
              const x = pointerPos.xSnapped - (lastPos?.current?.x ?? 0);
              const y = pointerPos.ySnapped - (lastPos?.current?.y ?? 0);
              const distance = Math.sqrt(x * x + y * y);

              if (distance > nodeDragThreshold) {
                startDrag(event);
              }
            }

            // skip events without movement
            if (
              (lastPos.current.x !== pointerPos.xSnapped ||
                lastPos.current.y !== pointerPos.ySnapped) &&
              dragItems.current &&
              dragStarted.current
            ) {
              dragEvent.current = event.sourceEvent as MouseEvent;
              mousePosition.current = getEventPosition(
                event.sourceEvent,
                containerBounds.current!,
              );
              updateNodes(pointerPos);
            }
          })
          .on("end", (event: UseDragEvent) => {
            if (!dragStarted.current) {
              return;
            }

            setDragging(false);
            autoPanStarted.current = false;
            dragStarted.current = false;
            cancelAnimationFrame(autoPanId.current);

            if (dragItems.current) {
              const { updateNodePositions } = store.getState();

              updateNodePositions(dragItems.current, false, false);
            }
          })
          .filter((event: MouseEvent) => {
            const target = event.target as HTMLDivElement;
            const isDraggable =
              !event.button &&
              (!noDragClassName ||
                !hasSelector(target, `.${noDragClassName}`, nodeRef));

            return isDraggable;
          });

        selection.call(dragHandler);

        return () => {
          selection.on(".drag", null);
        };
      }
    }
  }, [
    nodeRef,
    disabled,
    noDragClassName,
    isSelectable,
    store,
    nodeId,
    selectNodesOnDrag,
    getPointerPosition,
  ]);

  return dragging;
}

export default useDrag;
