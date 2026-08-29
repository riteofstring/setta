import cc from "classcat";
import _ from "lodash";
import React, { useEffect, useRef, type KeyboardEvent } from "react";
import { openWorkspaceSelectionMenu } from "../context-menu/workspaceMenuInvocation";
import {
  getOwnerKeyboardMenuPoint,
  isWorkspaceMenuKeyboardEvent,
} from "../context-menu/workspaceMenuOwnership";
import { useDndMode } from "../dnd/dndState";
import {
  setSelectionDragHandle,
  setSelectionDragPrimaryId,
} from "../dnd/selectionDragHandle";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { getSectionOrThrow } from "../document/documentSelectors";
import { useActiveSections, useWorkspaceDocument } from "../document/stores";
import { NO_PAN_CLASS_NAME } from "../interaction";
import { useWorkspaceHost } from "../workspaceHostContext";
import { useReactFlow } from "./store";
import type { Rect } from "./types";
import useDrag from "./useDrag";
import { updatePositions } from "./useUpdateNodePositions";
import { arrowKeyDiffs } from "./wrapNode";

function NodesSelectionComponent({ x, y, width, height }: Rect) {
  const host = useWorkspaceHost();
  const transformString = useReactFlow(
    (s) =>
      `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`,
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

  useDrag({
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
      {}
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

function NodesSelectionDragHandleComponent({ x, y, width, height }: Rect) {
  const host = useWorkspaceHost();
  const transformString = useReactFlow(
    (s) =>
      `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`,
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

const NodesSelection = React.memo(NodesSelectionComponent);
const NodesSelectionDragHandle = React.memo(NodesSelectionDragHandleComponent);

function NodesSelectionWrapperComponent() {
  const nodesSelectionDims = useReactFlow(
    (s) => s.nodesSelectionDims,
    _.isEqual,
  );
  return nodesSelectionDims && <NodesSelection {...nodesSelectionDims} />;
}

export const NodesSelectionWrapper = React.memo(NodesSelectionWrapperComponent);

function NodesSelectionDragHandleWrapperComponent() {
  const nodesSelectionDims = useReactFlow(
    (s) => s.nodesSelectionDims,
    _.isEqual,
  );
  const { isMovingFree } = useDndMode();
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  if (!nodesSelectionDims || !isMovingFree || !canEditLayout) {
    return null;
  }
  return <NodesSelectionDragHandle {...nodesSelectionDims} />;
}

export const NodesSelectionDragHandleWrapper = React.memo(
  NodesSelectionDragHandleWrapperComponent,
);
