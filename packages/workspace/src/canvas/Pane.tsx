import React, {
  memo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
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

const selector = (s: ReactFlowState) => s.userSelectionActive;

const Pane = memo(({ isSelecting, children }: PaneProps) => {
  const container = useRef<HTMLDivElement | null>(null);
  const prevSelectedNodesCount = useRef<number>(0);
  const containerBounds = useRef<DOMRect | undefined>(undefined);
  const userSelectionActive = useReactFlow(selector);

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

    useReactFlow.getState().setNodesSelection(prevSelectedNodesCount.current);
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
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      onClick();
    }
  };

  const hasActiveSelection = isSelecting || userSelectionActive;

  return (
    <div
      className="react-flow__pane"
      role="button"
      aria-label="Workspace canvas background"
      tabIndex={-1}
      onClick={hasActiveSelection ? undefined : wrapHandler(onClick, container)}
      onKeyDown={onKeyDown}
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
