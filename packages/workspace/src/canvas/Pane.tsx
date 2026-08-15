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
import { applyActiveSectionChange } from "./activeSectionController";
import { getNodesInside } from "./graph";
import { useWorkspaceOptions } from "./options";
import { useReactFlow } from "./store";
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

const userSelectionActiveSelector = (state: ReactFlowState) => state.userSelectionActive;
const pendingUserSelectionSelector = (state: ReactFlowState) => state.userSelectionRect !== null;

function canMoveUserSelection(
  isSelecting: boolean,
  containerBounds: DOMRect | undefined,
): containerBounds is DOMRect {
  return isSelecting && containerBounds !== undefined;
}

const Pane = memo(({ isSelecting, children }: PaneProps) => {
  const container = useRef<HTMLDivElement | null>(null);
  const prevSelectedNodesCount = useRef<number>(0);
  const containerBounds = useRef<DOMRect | undefined>(undefined);
  const userSelectionActive = useReactFlow(userSelectionActiveSelector);
  const hasPendingUserSelection = useReactFlow(pendingUserSelectionSelector);

  const resetUserSelection = () => {
    useReactFlow.setState({
      userSelectionActive: false,
      userSelectionRect: null,
    });

    prevSelectedNodesCount.current = 0;
  };

  const onClick = () => {
    applyActiveSectionChange({ interaction: "pane-click" });
    useReactFlow.setState({
      nodesSelectionDims: null,
    });
  };

  const onMouseDown = (event: ReactMouseEvent): void => {
    const { domNode } = useReactFlow.getState();
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

    applyActiveSectionChange({
      interaction: "selection-rect",
      selectedIds: [],
    });

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
    const bounds = containerBounds.current;
    if (!userSelectionRect) {
      return;
    }
    if ((event.buttons & 1) === 0) {
      resetUserSelection();
      return;
    }
    if (!canMoveUserSelection(isSelecting, bounds)) {
      return;
    }

    useReactFlow.setState({
      userSelectionActive: true,
      nodesSelectionDims: null,
    });

    const mousePos = getEventPosition(event, bounds);
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
      nextUserSelectRect,
      transform,
      useWorkspaceOptions.getState().selectionMode === "partial",
    );

    if (prevSelectedNodesCount.current !== selectedNodeIds.length) {
      prevSelectedNodesCount.current = selectedNodeIds.length;
      applyActiveSectionChange({
        interaction: "selection-rect",
        selectedIds: selectedNodeIds,
      });
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
    if (!userSelectionActive && userSelectionRect && event.target === container.current) {
      onClick();
    }

    useReactFlow.getState().setNodesSelection(prevSelectedNodesCount.current, true);
    resetUserSelection();
  };

  const onMouseLeave = () => {
    const { userSelectionRect } = useReactFlow.getState();
    if (userSelectionRect && userSelectionActive) {
      useReactFlow.getState().setNodesSelection(prevSelectedNodesCount.current);
    }
    resetUserSelection();
  };

  // The reference clears the selection through an app-level Escape shortcut; the package keeps
  // the keyboard path on the pane itself.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.target === event.currentTarget &&
      isWorkspaceMenuKeyboardEvent(event.nativeEvent) &&
      openWorkspacePaneMenu(getOwnerKeyboardMenuPoint(event.currentTarget), event.currentTarget)
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
    if (!openWorkspacePaneMenu({ x: event.clientX, y: event.clientY }, event.currentTarget)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const hasActiveSelection = isSelecting || userSelectionActive || hasPendingUserSelection;

  // The canvas pane owns background selection gestures and Escape without presenting itself as a
  // false button.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
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
