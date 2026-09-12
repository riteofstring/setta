import cc from "classcat";
import _ from "lodash";
import React, { useEffect, useRef, type KeyboardEvent } from "react";
import { openWorkspaceSelectionMenu } from "../../context-menu/workspaceMenuInvocation";
import {
  getOwnerKeyboardMenuPoint,
  isWorkspaceMenuKeyboardEvent,
} from "../../context-menu/workspaceMenuOwnership";
import { useDndMode } from "../../dnd/dndState";
import {
  setSelectionDragHandle,
  setSelectionDragPrimaryId,
} from "../../dnd/selectionDragHandle";
import { useWorkspaceCapabilities } from "../../document/capabilities";
import { getSectionOrThrow } from "../../document/documentSelectors";
import { useActiveSections, useWorkspaceDocument } from "../../document/stores";
import type { Position } from "../../document/types";
import { NO_PAN_CLASS_NAME } from "../../interaction";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { useReactFlow } from "../store";
import type { Rect } from "../types";
import { updatePositions } from "../useUpdateNodePositions";
import { useWorkspaceXyflowNodesSelectionDrag } from "./useWorkspaceXyflowNodesSelectionDrag";

const arrowKeyDiffs: Record<string, Position> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

function WorkspaceXyflowNodesSelectionComponent({ x, y, width, height }: Rect) {
  const host = useWorkspaceHost();
  const transformString = useReactFlow(
    (state) =>
      `translate(${state.transform[0]}px,${state.transform[1]}px) scale(${state.transform[2]})`,
  );
  const { isSorting, isMovingFree } = useDndMode();
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  const activeIds = useActiveSections((state) => state.activeIds, _.isEqual);
  const activeNames = useWorkspaceDocument(
    (state) =>
      activeIds.map((sectionId) => getSectionOrThrow(state, sectionId).name),
    _.isEqual,
  );
  const nodeRef = useRef<HTMLDivElement>(null);
  const primarySelectionId =
    activeIds.length > 0 ? (activeIds[activeIds.length - 1] ?? null) : null;

  useEffect(() => {
    nodeRef.current?.focus({
      preventScroll: true,
    });
  }, []);

  useEffect(() => {
    setSelectionDragPrimaryId(host, primarySelectionId);
  }, [host, primarySelectionId]);

  useEffect(() => {
    return () => {
      setSelectionDragPrimaryId(host, null);
    };
  }, [host]);

  useWorkspaceXyflowNodesSelectionDrag({
    nodeRef,
    disabled: !canEditLayout,
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.target === event.currentTarget &&
      isWorkspaceMenuKeyboardEvent(event.nativeEvent)
    ) {
      event.preventDefault();
      event.stopPropagation();
      openWorkspaceSelectionMenu(
        host,
        getOwnerKeyboardMenuPoint(event.currentTarget),
        event.currentTarget,
      );
      return;
    }
    if (
      canEditLayout &&
      Object.prototype.hasOwnProperty.call(arrowKeyDiffs, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      const diff = arrowKeyDiffs[event.key];
      if (!diff) {
        throw new Error(`Missing arrow key diff for ${event.key}.`);
      }
      updatePositions(host, {
        x: diff.x,
        y: diff.y,
        isShiftPressed: event.shiftKey,
      });
    }
  };

  return (
    <div
      className={cc([
        "react-flow__nodesselection",
        "react-flow__container",
        { [NO_PAN_CLASS_NAME]: canEditLayout },
      ])}
      style={{
        transform: transformString,
      }}
    >
      <div
        tabIndex={-1}
        ref={nodeRef}
        role="group"
        aria-label={`${activeIds.length} selected sections: ${activeNames.join(", ")}`}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+F10 ContextMenu"
        aria-disabled={!canEditLayout}
        className="react-flow__nodesselection-rect"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openWorkspaceSelectionMenu(
            host,
            { x: event.clientX, y: event.clientY },
            event.currentTarget,
          );
        }}
        onKeyDown={onKeyDown}
        style={{
          width,
          height,
          top: y,
          left: x,
          pointerEvents: isSorting || isMovingFree ? "none" : undefined,
        }}
      />
    </div>
  );
}

function WorkspaceXyflowNodesSelectionDragHandleComponent({
  x,
  y,
  width,
  height,
}: Rect) {
  const host = useWorkspaceHost();
  const transformString = useReactFlow(
    (state) =>
      `translate(${state.transform[0]}px,${state.transform[1]}px) scale(${state.transform[2]})`,
  );
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectionDragHandle(host, nodeRef.current);
    return () => {
      setSelectionDragHandle(host, null);
    };
  }, [host]);

  return (
    <div
      className={cc([
        "react-flow__nodesselection-hitbox",
        "react-flow__container",
        NO_PAN_CLASS_NAME,
      ])}
      style={{
        transform: transformString,
      }}
    >
      <div
        ref={nodeRef}
        className="react-flow__nodesselection-hitbox-rect"
        style={{
          width,
          height,
          top: y,
          left: x,
        }}
      />
    </div>
  );
}

const WorkspaceXyflowNodesSelection = React.memo(
  WorkspaceXyflowNodesSelectionComponent,
);
const WorkspaceXyflowNodesSelectionDragHandle = React.memo(
  WorkspaceXyflowNodesSelectionDragHandleComponent,
);

function WorkspaceXyflowNodesSelectionWrapperComponent() {
  const nodesSelectionDims = useReactFlow(
    (state) => state.nodesSelectionDims,
    _.isEqual,
  );
  return (
    nodesSelectionDims && (
      <WorkspaceXyflowNodesSelection {...nodesSelectionDims} />
    )
  );
}

export const WorkspaceXyflowNodesSelectionWrapper = React.memo(
  WorkspaceXyflowNodesSelectionWrapperComponent,
);

function WorkspaceXyflowNodesSelectionDragHandleWrapperComponent() {
  const nodesSelectionDims = useReactFlow(
    (state) => state.nodesSelectionDims,
    _.isEqual,
  );
  const { isMovingFree } = useDndMode();
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  if (!nodesSelectionDims || !isMovingFree || !canEditLayout) {
    return null;
  }
  return <WorkspaceXyflowNodesSelectionDragHandle {...nodesSelectionDims} />;
}

export const WorkspaceXyflowNodesSelectionDragHandleWrapper = React.memo(
  WorkspaceXyflowNodesSelectionDragHandleWrapperComponent,
);
