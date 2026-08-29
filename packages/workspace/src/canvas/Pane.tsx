import React, {
  memo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { openWorkspacePaneMenu } from "../context-menu/workspaceMenuInvocation";
import {
  getOwnerKeyboardMenuPoint,
  isWorkspaceMenuKeyboardEvent,
} from "../context-menu/workspaceMenuOwnership";
import { useWorkspaceHost } from "../workspaceHostContext";
import { applyActiveSectionChange } from "./activeSectionController";
import { getNodesInside } from "./graph";
import { getWorkspaceOptionsStore } from "./options";
import { getReactFlowStore, useReactFlow } from "./store";
import { containerStyle } from "./styles";
import type { ReactFlowState } from "./types";
import UserSelection from "./UserSelection";
import { getEventPosition } from "./utils";

type PaneProps = {
  isSelecting: boolean;
  children: ReactNode;
};

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

const selector = (s: ReactFlowState) => s.userSelectionActive;

const Pane = memo(({ isSelecting, children }: PaneProps) => {
  const host = useWorkspaceHost();
  const container = useRef<HTMLDivElement | null>(null);
  const prevSelectedNodesCount = useRef<number>(0);
  const containerBounds = useRef<DOMRect | undefined>(undefined);
  const userSelectionActive = useReactFlow(selector);

  const resetUserSelection = () => {
    getReactFlowStore(host).setState({
      userSelectionActive: false,
      userSelectionRect: null,
    });

    prevSelectedNodesCount.current = 0;
  };

  const onClick = () => {
    applyActiveSectionChange(host, { interaction: "pane-click" });
    getReactFlowStore(host).setState({
      nodesSelectionDims: null,
    });
  };

  const onMouseDown = (event: ReactMouseEvent): void => {
    const { domNode } = getReactFlowStore(host).getState();
    containerBounds.current = domNode?.getBoundingClientRect();

    if (
      !isSelecting ||
      event.button !== 0 ||
      event.target !== container.current ||
      !containerBounds.current
    ) {
      return;
    }

    const { x, y } = getEventPosition(event, containerBounds.current);

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

  const onMouseMove = (event: ReactMouseEvent): void => {
    const { userSelectionRect, transform } = getReactFlowStore(host).getState();
    if (!isSelecting || !containerBounds.current || !userSelectionRect) {
      return;
    }

    getReactFlowStore(host).setState({
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

    const selectedNodeIds = getNodesInside(
      host,
      nextUserSelectRect,
      transform,
      getWorkspaceOptionsStore(host).getState().selectionMode === "partial",
    );

    if (prevSelectedNodesCount.current !== selectedNodeIds.length) {
      prevSelectedNodesCount.current = selectedNodeIds.length;
      applyActiveSectionChange(host, {
        interaction: "selection-rect",
        selectedIds: selectedNodeIds,
      });
    }

    getReactFlowStore(host).setState({
      userSelectionRect: nextUserSelectRect,
    });
  };

  const onMouseUp = (event: ReactMouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    const { userSelectionRect } = getReactFlowStore(host).getState();

    if (
      !userSelectionActive &&
      userSelectionRect &&
      event.target === container.current
    ) {
      onClick();
    }

    getReactFlowStore(host)
      .getState()
      .setNodesSelection(prevSelectedNodesCount.current, true);
    resetUserSelection();
  };

  const onMouseLeave = () => {
    const { userSelectionRect } = getReactFlowStore(host).getState();
    if (userSelectionRect && userSelectionActive) {
      getReactFlowStore(host)
        .getState()
        .setNodesSelection(prevSelectedNodesCount.current);
    }
    resetUserSelection();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.target === event.currentTarget &&
      isWorkspaceMenuKeyboardEvent(event.nativeEvent) &&
      openWorkspacePaneMenu(
        host,
        getOwnerKeyboardMenuPoint(event.currentTarget),
        event.currentTarget,
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === "Escape") {
      onClick();
    }
  };

  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== container.current) {
      return;
    }
    if (
      !openWorkspacePaneMenu(
        host,
        { x: event.clientX, y: event.clientY },
        event.currentTarget,
      )
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const hasActiveSelection = isSelecting || userSelectionActive;

  return (
    <div
      className="react-flow__pane"
      role="group"
      aria-label="Workspace canvas background"
      aria-keyshortcuts="Escape Shift+F10 ContextMenu"
      tabIndex={-1}
      onClick={hasActiveSelection ? undefined : wrapHandler(onClick, container)}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
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
});

Pane.displayName = "Pane";

export default Pane;
