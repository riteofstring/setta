import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { shallow } from "zustand/shallow";
import { applyActiveSectionChange } from "../activeSectionController";
import { getNodesInside } from "../graph";
import { getWorkspaceOptionsStore } from "../options";
import { getReactFlowStore, useReactFlow } from "../store";
import { getEventPosition } from "../utils";
import { useWorkspaceHost } from "../../workspaceHostContext";
import {
  WorkspaceXyflowNodesSelectionDragHandleWrapper,
  WorkspaceXyflowNodesSelectionWrapper,
} from "./WorkspaceXyflowNodesSelection";

function WorkspaceXyflowUserSelection() {
  const { userSelectionActive, userSelectionRect } = useReactFlow(
    (state) => ({
      userSelectionActive: state.userSelectionActive,
      userSelectionRect: state.userSelectionRect,
    }),
    shallow,
  );
  const isActive = userSelectionActive && userSelectionRect;

  if (!isActive) {
    return null;
  }

  return (
    <div
      className="react-flow__selection react-flow__container"
      style={{
        width: userSelectionRect.width,
        height: userSelectionRect.height,
        transform: `translate(${userSelectionRect.x}px, ${userSelectionRect.y}px)`,
      }}
    />
  );
}

type WorkspaceXyflowSelectionProps = {
  rootElement: HTMLDivElement | null;
  selectionPortalElement: HTMLElement | null;
  suppressNextPaneClickRef: { current: boolean };
};

function isMarqueeMouseChord(event: MouseEvent): boolean {
  return event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

export function WorkspaceXyflowSelection({
  rootElement,
  selectionPortalElement,
  suppressNextPaneClickRef,
}: WorkspaceXyflowSelectionProps) {
  const host = useWorkspaceHost();
  const previousSelectedCountRef = useRef(0);
  const containerBoundsRef = useRef<DOMRect | undefined>(undefined);
  const clearSuppressedClickRef = useRef<number | undefined>(undefined);
  const pane = rootElement?.querySelector<HTMLDivElement>(".react-flow__pane");

  useEffect(() => {
    if (!pane) {
      return;
    }

    let isTrackingSelection = false;

    const clearSuppressedClick = () => {
      suppressNextPaneClickRef.current = false;
      if (clearSuppressedClickRef.current !== undefined) {
        window.clearTimeout(clearSuppressedClickRef.current);
        clearSuppressedClickRef.current = undefined;
      }
    };

    const scheduleSuppressedClickReset = () => {
      if (clearSuppressedClickRef.current !== undefined) {
        window.clearTimeout(clearSuppressedClickRef.current);
      }
      clearSuppressedClickRef.current = window.setTimeout(
        clearSuppressedClick,
        0,
      );
    };

    const resetUserSelection = () => {
      getReactFlowStore(host).setState({
        userSelectionActive: false,
        userSelectionRect: null,
      });
      previousSelectedCountRef.current = 0;
    };

    function stopTrackingSelection() {
      if (!isTrackingSelection) {
        return;
      }
      isTrackingSelection = false;
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("blur", handleWindowBlur);
    }

    function handleMouseMove(event: MouseEvent) {
      if (!isTrackingSelection) {
        return;
      }
      const canvasState = getReactFlowStore(host).getState();
      const userSelectionRect = canvasState.userSelectionRect;
      if (
        (!canvasState.selectionKeyPressed && !isMarqueeMouseChord(event)) ||
        !containerBoundsRef.current ||
        !userSelectionRect
      ) {
        return;
      }

      getReactFlowStore(host).setState({
        userSelectionActive: true,
        nodesSelectionDims: null,
      });

      const mousePosition = getEventPosition(event, containerBoundsRef.current);
      const startX = userSelectionRect.startX ?? 0;
      const startY = userSelectionRect.startY ?? 0;
      const nextUserSelectionRect = {
        ...userSelectionRect,
        x: mousePosition.x < startX ? mousePosition.x : startX,
        y: mousePosition.y < startY ? mousePosition.y : startY,
        width: Math.abs(mousePosition.x - startX),
        height: Math.abs(mousePosition.y - startY),
      };
      const selectedIds = getNodesInside(
        host,
        nextUserSelectionRect,
        canvasState.transform,
        getWorkspaceOptionsStore(host).getState().selectionMode === "partial",
      );

      if (previousSelectedCountRef.current !== selectedIds.length) {
        previousSelectedCountRef.current = selectedIds.length;
        applyActiveSectionChange(host, {
          interaction: "selection-rect",
          selectedIds,
        });
      }

      getReactFlowStore(host).setState({
        userSelectionRect: nextUserSelectionRect,
      });
    }

    function handleMouseUp(event: MouseEvent) {
      if (!isTrackingSelection || event.button !== 0) {
        return;
      }
      stopTrackingSelection();
      const canvasState = getReactFlowStore(host).getState();
      if (!canvasState.userSelectionRect) {
        resetUserSelection();
        return;
      }

      suppressNextPaneClickRef.current = true;
      scheduleSuppressedClickReset();
      canvasState.setNodesSelection(previousSelectedCountRef.current, true);
      resetUserSelection();
    }

    function handleWindowBlur() {
      if (!isTrackingSelection) {
        return;
      }
      stopTrackingSelection();
      const canvasState = getReactFlowStore(host).getState();
      if (canvasState.userSelectionActive) {
        canvasState.setNodesSelection(previousSelectedCountRef.current);
      }
      resetUserSelection();
    }

    const handleMouseDown = (event: MouseEvent) => {
      const canvasState = getReactFlowStore(host).getState();
      containerBoundsRef.current = canvasState.domNode?.getBoundingClientRect();

      if (!canvasState.selectionKeyPressed && !isMarqueeMouseChord(event)) {
        return;
      }
      if (
        event.button !== 0 ||
        event.target !== pane ||
        !containerBoundsRef.current
      ) {
        return;
      }

      event.stopImmediatePropagation();
      isTrackingSelection = true;
      window.addEventListener("mousemove", handleMouseMove, true);
      window.addEventListener("mouseup", handleMouseUp, true);
      window.addEventListener("blur", handleWindowBlur);
      const { x, y } = getEventPosition(event, containerBoundsRef.current);
      previousSelectedCountRef.current = 0;
      applyActiveSectionChange(host, {
        interaction: "selection-rect",
        selectedIds: [],
      });
      getReactFlowStore(host).setState({
        userSelectionRect: {
          width: 0,
          height: 0,
          startX: x,
          startY: y,
          x,
          y,
        },
      });
    };

    pane.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      pane.removeEventListener("mousedown", handleMouseDown, true);
      const wasTrackingSelection = isTrackingSelection;
      stopTrackingSelection();
      if (wasTrackingSelection) {
        resetUserSelection();
      }
      clearSuppressedClick();
    };
  }, [host, pane, suppressNextPaneClickRef]);

  if (!pane) {
    return null;
  }

  return (
    <>
      {createPortal(
        <>
          <WorkspaceXyflowNodesSelectionDragHandleWrapper />
          <WorkspaceXyflowNodesSelectionWrapper />
        </>,
        pane,
      )}
      {selectionPortalElement
        ? createPortal(<WorkspaceXyflowUserSelection />, selectionPortalElement)
        : null}
    </>
  );
}
