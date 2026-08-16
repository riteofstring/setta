import { drag } from "d3-drag";
import { select } from "d3-selection";
import type { MouseEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { setZIndices } from "../document/sectionZIndices";
import { useNodeInternals } from "../document/stores";
import type { Position } from "../document/types";
import { NO_DRAG_CLASS_NAME } from "../interaction";
import { getDragItems, hasSelector } from "./dragItems";
import { useCanvasGestures } from "./gestureState";
import {
  commitTopLevelLayoutToDocument,
  raiseTempZIndex,
  updateNodePositions,
} from "./nodeInternalsActions";
import { useWorkspaceOptions } from "./options";
import { useReactFlow } from "./store";
import type { NodeDragItem, UseDragEvent } from "./types";
import useGetPointerPosition from "./useGetPointerPosition";
import { calcAutoPan, getEventPosition } from "./utils";

type UseDragParams = {
  nodeRef: RefObject<Element | null>;
  disabled?: boolean;
  nodeId?: string;
};

function useDrag({ nodeRef, disabled = false, nodeId }: UseDragParams) {
  const [dragging, setDragging] = useState<boolean>(false);
  const dragItems = useRef<Array<NodeDragItem>>([]);
  const lastPos = useRef<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const autoPanId = useRef(0);
  const containerBounds = useRef<DOMRect | null>(null);
  const mousePosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const autoPanStarted = useRef(false);
  const dragStarted = useRef(false);

  const getPointerPosition = useGetPointerPosition();

  useEffect(() => {
    if (nodeRef?.current) {
      const selection = select(nodeRef.current);

      const updateNodes = ({ x, y }: Position, dragEnd = false) => {
        const { nodesSelectionDims, shiftNodesSelection, setNodesSelection } =
          useReactFlow.getState();

        const { snapGrid, snapToGrid } = useWorkspaceOptions.getState();

        const lastX = lastPos.current.x;
        const lastY = lastPos.current.y;
        if (lastX === null || lastY === null) {
          throw new Error(
            "Drag position update fired before the drag recorded a position.",
          );
        }
        const delta = { x: x - lastX, y: y - lastY };
        lastPos.current = { x, y };

        let hasChange = false;

        dragItems.current = dragItems.current.map((n) => {
          const nextPosition = { x: x - n.distance.x, y: y - n.distance.y };

          if (dragEnd && snapToGrid) {
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

        updateNodePositions(dragItems.current);
        // When dragging a selection, nodeId is undefined.
        if (!nodeId && nodesSelectionDims) {
          if (dragEnd && snapToGrid) {
            setNodesSelection(dragItems.current.length);
          } else {
            shiftNodesSelection(delta);
          }
        }
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
          const { transform, panBy } = useReactFlow.getState();

          const newX = (lastPos.current.x ?? 0) - xMovement / transform[2];
          const newY = (lastPos.current.y ?? 0) - yMovement / transform[2];

          if (panBy({ x: xMovement, y: yMovement })) {
            updateNodes({ x: newX, y: newY });
          }
        }
        autoPanId.current = requestAnimationFrame(autoPan);
      };

      const updateMouseFromEvent = (event: UseDragEvent) => {
        mousePosition.current = getEventPosition(
          event.sourceEvent,
          containerBounds.current ?? undefined,
        );
      };

      const startDrag = (event: UseDragEvent) => {
        const nodeInternals = useNodeInternals.getState().x;
        dragStarted.current = true;

        const pointerPos = getPointerPosition(event);
        lastPos.current = pointerPos;
        dragItems.current = getDragItems(nodeInternals, pointerPos, nodeId);
        raiseTempZIndex(dragItems.current);
        useCanvasGestures.setState({ mouseDownDraggingSection: true });
      };

      const startAutoPanIfNeeded = (autoPanOnNodeDrag: boolean) => {
        if (
          !autoPanStarted.current &&
          dragStarted.current &&
          autoPanOnNodeDrag
        ) {
          autoPanStarted.current = true;
          autoPan();
        }
      };

      const startDragOnceThresholdIsMet = (
        event: UseDragEvent,
        pointerPos: ReturnType<typeof getPointerPosition>,
        nodeDragThreshold: number,
      ) => {
        if (dragStarted.current) {
          return;
        }

        const x = pointerPos.xSnapped - (lastPos.current.x ?? 0);
        const y = pointerPos.ySnapped - (lastPos.current.y ?? 0);
        const distance = Math.sqrt(x * x + y * y);

        if (distance > nodeDragThreshold) {
          startDrag(event);
        }
      };

      const hasPointerMoved = (
        pointerPos: ReturnType<typeof getPointerPosition>,
      ) =>
        lastPos.current.x !== pointerPos.xSnapped ||
        lastPos.current.y !== pointerPos.ySnapped;

      const finishDrag = () => {
        setDragging(false);
        autoPanStarted.current = false;
        dragStarted.current = false;
        cancelAnimationFrame(autoPanId.current);
        // The reference's drag end always normalizes: every completed drag densely renumbers
        // the nodes with the dragged ones on top before the layout commit.
        setZIndices(
          dragItems.current.map((dragItem) => dragItem.id),
          true,
        );
        // The reference persists the finished gesture through its layout commit funnel here.
        commitTopLevelLayoutToDocument();
      };

      if (disabled) {
        selection.on(".drag", null);
      } else {
        const dragHandler = drag()
          .on("start", (event: UseDragEvent) => {
            const { domNode, nodeDragThreshold } = useReactFlow.getState();
            if (nodeDragThreshold === 0) {
              startDrag(event);
            }

            const pointerPos = getPointerPosition(event);
            lastPos.current = pointerPos;
            containerBounds.current = domNode?.getBoundingClientRect() || null;
            updateMouseFromEvent(event);
          })
          .on("drag", (event: UseDragEvent) => {
            const pointerPos = getPointerPosition(event);
            const { autoPanOnNodeDrag, nodeDragThreshold } =
              useReactFlow.getState();

            startAutoPanIfNeeded(autoPanOnNodeDrag);
            startDragOnceThresholdIsMet(event, pointerPos, nodeDragThreshold);

            if (!dragStarted.current || !hasPointerMoved(pointerPos)) {
              return;
            }

            updateMouseFromEvent(event);
            updateNodes(pointerPos);
          })
          .on("end", () => {
            useCanvasGestures.setState({ mouseDownDraggingSection: false });
            if (!dragStarted.current) {
              return;
            }

            if (useWorkspaceOptions.getState().snapToGrid) {
              const lastX = lastPos.current.x;
              const lastY = lastPos.current.y;
              if (lastX === null || lastY === null) {
                throw new Error("Drag ended without a recorded position.");
              }
              updateNodes({ x: lastX, y: lastY }, true);
            }

            finishDrag();
          })
          .filter((event: MouseEvent) => {
            const target = event.target as HTMLDivElement;
            const isDraggable =
              !event.button &&
              !hasSelector(target, `.${NO_DRAG_CLASS_NAME}`, nodeRef);

            return isDraggable;
          });

        selection.call(dragHandler);

        return () => {
          selection.on(".drag", null);
        };
      }
    }
  }, [nodeRef, disabled, nodeId, getPointerPosition]);

  return dragging;
}

export default useDrag;
