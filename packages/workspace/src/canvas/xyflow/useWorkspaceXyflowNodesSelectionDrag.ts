import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { setZIndices } from "../../document/sectionZIndices.js";
import { getNodeInternalsStore } from "../../document/stores.js";
import type { Position } from "../../document/types.js";
import { NO_DRAG_CLASS_NAME } from "../../interaction.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";
import { getDragItems, hasSelector } from "../dragItems.js";
import { getCanvasGesturesStore } from "../gestureState.js";
import {
  raiseTempZIndex,
  updateNodePositions,
} from "../nodeInternalsActions.js";
import { getWorkspaceOptionsStore } from "../options.js";
import { getReactFlowStore } from "../store.js";
import type { NodeDragItem } from "../types.js";
import { calcAutoPan, getEventPosition } from "../utils.js";

type UseWorkspaceXyflowNodesSelectionDragParams = {
  nodeRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
};

export function useWorkspaceXyflowNodesSelectionDrag({
  nodeRef,
  disabled = false,
}: UseWorkspaceXyflowNodesSelectionDragParams) {
  const host = useWorkspaceHost();
  const dragItems = useRef<Array<NodeDragItem>>([]);
  const lastPos = useRef<Position | null>(null);
  const autoPanId = useRef(0);
  const containerBounds = useRef<DOMRect | null>(null);
  const mousePosition = useRef<Position>({ x: 0, y: 0 });
  const autoPanStarted = useRef(false);
  const dragStarted = useRef(false);
  const pointerId = useRef<number | null>(null);
  const pointerOrigin = useRef<Position | null>(null);
  const pointerMoved = useRef(false);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || disabled) {
      return;
    }

    let clickListener: ((event: MouseEvent) => void) | undefined;
    let clickTimeout: number | undefined;

    const getPointerPosition = (event: PointerEvent): Position => {
      const { transform } = getReactFlowStore(host).getState();
      return {
        x: (event.clientX - transform[0]) / transform[2],
        y: (event.clientY - transform[1]) / transform[2],
      };
    };

    const updateNodes = (position: Position, dragEnd = false): boolean => {
      const { nodesSelectionDims, shiftNodesSelection, setNodesSelection } =
        getReactFlowStore(host).getState();
      const { snapGrid, snapToGrid } =
        getWorkspaceOptionsStore(host).getState();
      const previousPosition = lastPos.current;
      if (!previousPosition) {
        throw new Error(
          "Drag position update fired before the drag recorded a position.",
        );
      }

      const delta = {
        x: position.x - previousPosition.x,
        y: position.y - previousPosition.y,
      };
      lastPos.current = position;

      let hasChange = false;
      dragItems.current = dragItems.current.map((item) => {
        const nextPosition = {
          x: position.x - item.distance.x,
          y: position.y - item.distance.y,
        };

        if (dragEnd && snapToGrid) {
          nextPosition.x =
            snapGrid[0] * Math.round(nextPosition.x / snapGrid[0]);
          nextPosition.y =
            snapGrid[1] * Math.round(nextPosition.y / snapGrid[1]);
        }

        hasChange =
          hasChange ||
          item.position.x !== nextPosition.x ||
          item.position.y !== nextPosition.y;
        item.position = nextPosition;
        return item;
      });

      if (!hasChange) {
        return false;
      }

      updateNodePositions(host, dragItems.current);
      if (nodesSelectionDims) {
        if (dragEnd && snapToGrid) {
          setNodesSelection(dragItems.current.length);
        } else {
          shiftNodesSelection(delta);
        }
      }
      return true;
    };

    const autoPan = (): void => {
      if (!autoPanStarted.current || !containerBounds.current) {
        return;
      }

      const [xMovement, yMovement] = calcAutoPan(
        mousePosition.current,
        containerBounds.current,
      );
      if (xMovement !== 0 || yMovement !== 0) {
        const { transform, panBy } = getReactFlowStore(host).getState();
        const previousPosition = lastPos.current ?? { x: 0, y: 0 };
        const nextPosition = {
          x: previousPosition.x - xMovement / transform[2],
          y: previousPosition.y - yMovement / transform[2],
        };
        if (panBy({ x: xMovement, y: yMovement })) {
          updateNodes(nextPosition);
        }
      }
      autoPanId.current = requestAnimationFrame(autoPan);
    };

    const startDrag = (position: Position) => {
      dragStarted.current = true;
      lastPos.current = position;
      dragItems.current = getDragItems(
        host,
        getNodeInternalsStore(host).getState().x,
        position,
      );
      raiseTempZIndex(host, dragItems.current);
      getCanvasGesturesStore(host).setState({
        mouseDownDraggingSection: true,
      });
    };

    const startAutoPanIfNeeded = () => {
      if (
        !autoPanStarted.current &&
        dragStarted.current &&
        getReactFlowStore(host).getState().autoPanOnNodeDrag
      ) {
        autoPanStarted.current = true;
        autoPan();
      }
    };

    const clearClickSuppression = () => {
      if (clickListener) {
        window.removeEventListener("click", clickListener, true);
        clickListener = undefined;
      }
      if (clickTimeout !== undefined) {
        window.clearTimeout(clickTimeout);
        clickTimeout = undefined;
      }
    };

    const suppressNextClick = () => {
      clearClickSuppression();
      clickListener = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        clearClickSuppression();
      };
      window.addEventListener("click", clickListener, true);
      clickTimeout = window.setTimeout(clearClickSuppression, 0);
    };

    const releasePointer = () => {
      const activePointerId = pointerId.current;
      if (
        activePointerId !== null &&
        node.hasPointerCapture?.(activePointerId)
      ) {
        node.releasePointerCapture(activePointerId);
      }
      pointerId.current = null;
    };

    const removePointerListeners = () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
    };

    const finishDrag = () => {
      autoPanStarted.current = false;
      dragStarted.current = false;
      cancelAnimationFrame(autoPanId.current);
      autoPanId.current = 0;
      setZIndices(
        host,
        dragItems.current.map((item) => item.id),
        true,
        "section-move",
      );
    };

    const endPointerSession = (event: PointerEvent) => {
      if (event.pointerId !== pointerId.current) {
        return;
      }

      removePointerListeners();
      releasePointer();
      getCanvasGesturesStore(host).setState({
        mouseDownDraggingSection: false,
      });
      if (!dragStarted.current) {
        return;
      }

      if (getWorkspaceOptionsStore(host).getState().snapToGrid) {
        const position = lastPos.current;
        if (!position) {
          throw new Error("Drag ended without a recorded position.");
        }
        updateNodes(position, true);
      }

      const didMove = pointerMoved.current;
      finishDrag();
      if (didMove) {
        suppressNextClick();
      }
    };

    const recordPointerMovement = (event: PointerEvent): void => {
      const origin = pointerOrigin.current;
      if (
        origin &&
        (origin.x !== event.clientX || origin.y !== event.clientY)
      ) {
        pointerMoved.current = true;
      }
    };

    const startDragAfterThreshold = (pointerPosition: Position): void => {
      if (dragStarted.current) {
        return;
      }
      const previousPosition = lastPos.current;
      if (!previousPosition) {
        throw new Error("Drag moved without an initial pointer position.");
      }
      const distance = Math.hypot(
        pointerPosition.x - previousPosition.x,
        pointerPosition.y - previousPosition.y,
      );
      if (distance > getReactFlowStore(host).getState().nodeDragThreshold) {
        startDrag(pointerPosition);
      }
    };

    const pointerPositionsMatch = (left: Position, right: Position): boolean =>
      left.x === right.x && left.y === right.y;

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== pointerId.current) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      recordPointerMovement(event);

      const pointerPosition = getPointerPosition(event);
      startAutoPanIfNeeded();
      startDragAfterThreshold(pointerPosition);

      const previousPosition = lastPos.current;
      if (
        !dragStarted.current ||
        !previousPosition ||
        pointerPositionsMatch(previousPosition, pointerPosition)
      ) {
        return;
      }

      mousePosition.current = getEventPosition(
        event,
        containerBounds.current ?? undefined,
      );
      updateNodes(pointerPosition);
    }

    function handlePointerUp(event: PointerEvent) {
      endPointerSession(event);
    }

    function handlePointerCancel(event: PointerEvent) {
      endPointerSession(event);
    }

    const canStartPointerSession = (event: PointerEvent): boolean => {
      if (
        pointerId.current !== null ||
        !event.isPrimary ||
        event.button !== 0
      ) {
        return false;
      }
      if (!(event.target instanceof Element)) {
        return false;
      }
      return !hasSelector(event.target, `.${NO_DRAG_CLASS_NAME}`, nodeRef);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!canStartPointerSession(event)) {
        return;
      }

      event.stopImmediatePropagation();
      pointerId.current = event.pointerId;
      dragStarted.current = false;
      autoPanStarted.current = false;
      pointerOrigin.current = { x: event.clientX, y: event.clientY };
      pointerMoved.current = false;
      const pointerPosition = getPointerPosition(event);
      lastPos.current = pointerPosition;
      containerBounds.current =
        getReactFlowStore(host).getState().domNode?.getBoundingClientRect() ??
        null;
      mousePosition.current = getEventPosition(
        event,
        containerBounds.current ?? undefined,
      );
      if (getReactFlowStore(host).getState().nodeDragThreshold === 0) {
        startDrag(pointerPosition);
      }

      node.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", handlePointerMove, true);
      window.addEventListener("pointerup", handlePointerUp, true);
      window.addEventListener("pointercancel", handlePointerCancel, true);
    };

    node.addEventListener("pointerdown", handlePointerDown);
    return () => {
      node.removeEventListener("pointerdown", handlePointerDown);
      removePointerListeners();
      releasePointer();
      clearClickSuppression();
      autoPanStarted.current = false;
      cancelAnimationFrame(autoPanId.current);
      autoPanId.current = 0;
      if (dragStarted.current) {
        getCanvasGesturesStore(host).setState({
          mouseDownDraggingSection: false,
        });
      }
    };
  }, [disabled, host, nodeRef]);
}
