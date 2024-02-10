/**
 * The user selection rectangle gets displayed when a user drags the mouse while pressing shift
 */

import { useActiveSection } from "models/activeSection";
import { useContextMenus } from "models/contextMenus";
import {
  onNodesChange,
  resetSelectedElements,
  useNodeInternals,
} from "models/info/nodeInternals";
import React, {
  memo,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useRef,
} from "react";
import { REACT_FLOW_STORE } from "utils/constants";
import { useReactFlow } from "xyflow/core/store";
import { getNodesInside } from "xyflow/core/utils/graph";
import { shallow } from "zustand/shallow";
import UserSelection from "../../components/UserSelection";
import { containerStyle } from "../../styles";
import type { NodeChange, ReactFlowProps, ReactFlowState } from "../../types";
import { SelectionMode } from "../../types";
import { getEventPosition } from "../../utils";
import { getSelectionChanges } from "../../utils/changes";

type PaneProps = {
  isSelecting: boolean;
  children: ReactNode;
} & Partial<Pick<ReactFlowProps, "selectionMode" | "panOnDrag">>;

const wrapHandler = (
  handler: React.MouseEventHandler | undefined,
  containerRef: React.MutableRefObject<HTMLDivElement | null>,
): React.MouseEventHandler => {
  return (event: ReactMouseEvent) => {
    if (event.target !== containerRef.current) {
      return;
    }
    handler?.(event);
  };
};

const selector = (s: ReactFlowState) => ({
  userSelectionActive: s.userSelectionActive,
  elementsSelectable: s.elementsSelectable,
  dragging: s.paneDragging,
});

const Pane = memo(
  ({
    isSelecting,
    selectionMode = SelectionMode.Full,
    panOnDrag,
    children,
  }: PaneProps) => {
    const container = useRef<HTMLDivElement | null>(null);
    const prevSelectedNodesCount = useRef<number>(0);
    const containerBounds = useRef<DOMRect>();
    const { userSelectionActive, elementsSelectable } = useReactFlow(
      selector,
      shallow,
    );

    const resetUserSelection = () => {
      useReactFlow.setState({
        userSelectionActive: false,
        userSelectionRect: null,
      });

      prevSelectedNodesCount.current = 0;
    };

    const onClick = (event: ReactMouseEvent) => {
      useActiveSection.getState().clear();
      REACT_FLOW_STORE.lastPaneClickLocation =
        REACT_FLOW_STORE.rf.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
      resetSelectedElements();
      useReactFlow.setState({
        nodesSelectionDims: null,
      });
    };

    const onContextMenu = (event: ReactMouseEvent) => {
      if (Array.isArray(panOnDrag) && panOnDrag?.includes(2)) {
        event.preventDefault();
        return;
      }
      useContextMenus.getState().openPane(event);
    };

    const onMouseDown = (event: ReactMouseEvent): void => {
      const { domNode } = useReactFlow.getState();
      containerBounds.current = domNode?.getBoundingClientRect();

      if (
        !elementsSelectable ||
        !isSelecting ||
        event.button !== 0 ||
        event.target !== container.current ||
        !containerBounds.current
      ) {
        return;
      }

      const { x, y } = getEventPosition(event, containerBounds.current);

      resetSelectedElements();

      useReactFlow.setState({
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

    const onMouseMove = (event: ReactMouseEvent): void => {
      const { userSelectionRect, transform } = useReactFlow.getState();
      if (!isSelecting || !containerBounds.current || !userSelectionRect) {
        return;
      }

      useReactFlow.setState({
        userSelectionActive: true,
        nodesSelectionDims: null,
      });

      const mousePos = getEventPosition(event, containerBounds.current);
      const startX = userSelectionRect.startX ?? 0;
      const startY = userSelectionRect.startY ?? 0;

      const nextUserSelectRect = {
        ...userSelectionRect,
        x: mousePos.x < startX ? mousePos.x : startX,
        y: mousePos.y < startY ? mousePos.y : startY,
        width: Math.abs(mousePos.x - startX),
        height: Math.abs(mousePos.y - startY),
      };

      const nodes = useNodeInternals.getState().getNodes();
      const selectedNodeIds = getNodesInside(
        nextUserSelectRect,
        transform,
        selectionMode === SelectionMode.Partial,
        true,
      );
      // const selectedNodeIds = selectedNodes.map((n) => n.id);

      if (prevSelectedNodesCount.current !== selectedNodeIds.length) {
        prevSelectedNodesCount.current = selectedNodeIds.length;
        const changes = getSelectionChanges(
          nodes,
          selectedNodeIds,
        ) as NodeChange[];
        if (changes.length) {
          onNodesChange(changes);
        }
      }

      useReactFlow.setState({
        userSelectionRect: nextUserSelectRect,
      });
    };

    const onMouseUp = (event: ReactMouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      const { userSelectionRect } = useReactFlow.getState();
      // We only want to trigger click functions when in selection mode if
      // the user did not move the mouse.
      if (
        !userSelectionActive &&
        userSelectionRect &&
        event.target === container.current
      ) {
        onClick(event);
      }

      useReactFlow.getState().setNodesSelection(prevSelectedNodesCount.current);
      resetUserSelection();
    };

    const onMouseLeave = (event: ReactMouseEvent) => {
      if (userSelectionActive) {
        useReactFlow
          .getState()
          .setNodesSelection(prevSelectedNodesCount.current);
      }
      resetUserSelection();
    };

    const hasActiveSelection =
      elementsSelectable && (isSelecting || userSelectionActive);

    return (
      <div
        className="react-flow__pane"
        onClick={
          hasActiveSelection ? undefined : wrapHandler(onClick, container)
        }
        onContextMenu={wrapHandler(onContextMenu, container)}
        onMouseDown={hasActiveSelection ? onMouseDown : undefined}
        onMouseMove={hasActiveSelection ? onMouseMove : undefined}
        onMouseUp={hasActiveSelection ? onMouseUp : undefined}
        onMouseLeave={hasActiveSelection ? onMouseLeave : undefined}
        ref={container}
        style={containerStyle}
      >
        {children}
        <UserSelection />
      </div>
    );
  },
);

Pane.displayName = "Pane";

export default Pane;
