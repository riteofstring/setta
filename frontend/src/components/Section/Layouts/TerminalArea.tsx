import _ from "lodash";
import React, { useState } from "react";
import { useReactFlow } from "forks/xyflow/core/store";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useTerminal } from "state/hooks/terminals/terminal";
import { logTerminalLockDebug } from "utils/terminalLockDebug";

function _TerminalArea({ sectionId }) {
  const { width, height, positionAndSizeLocked } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return {
      ...impl.size,
      positionAndSizeLocked: impl.positionAndSizeLocked,
    };
  }, _.isEqual);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  return (
    <TerminalAreaReadWrite
      sectionId={sectionId}
      width={width}
      height={height}
      hasScrollbar={hasScrollbar}
      setHasScrollbar={setHasScrollbar}
      positionAndSizeLocked={positionAndSizeLocked}
    />
  );
}

export const TerminalArea = React.memo(_TerminalArea);

function TerminalAreaReadWrite({
  sectionId,
  width,
  height,
  hasScrollbar,
  setHasScrollbar,
  positionAndSizeLocked,
}) {
  const terminalRef = useTerminal({
    sectionId,
    width,
    height,
    setHasScrollbar,
  });

  return (
    <TerminalAreaCore
      width={width}
      height={height}
      hasScrollbar={hasScrollbar}
      sectionId={sectionId}
      positionAndSizeLocked={positionAndSizeLocked}
      terminalRef={terminalRef}
    />
  );
}

function TerminalAreaCore({
  width,
  height,
  hasScrollbar,
  terminalRef,
  sectionId,
  positionAndSizeLocked,
}) {
  function logMouseEvent(
    name: string,
    event: React.MouseEvent<HTMLDivElement>,
  ) {
    if (!positionAndSizeLocked) {
      return;
    }
    if (name === "terminal_mouse_move" && event.buttons !== 1) {
      return;
    }

    const flowState = useReactFlow.getState();
    const selectionRect = flowState.userSelectionRect
      ? {
          x: flowState.userSelectionRect.x,
          y: flowState.userSelectionRect.y,
          width: flowState.userSelectionRect.width,
          height: flowState.userSelectionRect.height,
        }
      : null;

    const target = event.target;
    const targetElement = target instanceof HTMLElement ? target : null;
    const targetClassName =
      typeof targetElement?.className === "string"
        ? targetElement.className
        : null;
    const activeElement =
      typeof document !== "undefined" ? document.activeElement : null;
    const activeElementTag =
      activeElement instanceof HTMLElement ? activeElement.tagName : null;
    const activeElementClassName =
      activeElement instanceof HTMLElement
        ? activeElement.className
        : null;

    logTerminalLockDebug(name, {
      sectionId,
      positionAndSizeLocked,
      button: event.button,
      buttons: event.buttons,
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      targetTag: targetElement?.tagName ?? null,
      targetClassName,
      currentTargetClassName: event.currentTarget.className,
      activeElementTag,
      activeElementClassName,
      selectionKeyPressed: flowState.selectionKeyPressed,
      userSelectionActive: flowState.userSelectionActive,
      userSelectionRect: selectionRect,
    });
  }

  return (
    <div
      ref={terminalRef}
      className={`${hasScrollbar ? "nowheel" : ""} nodrag section-row-search-gutter section-key-value`}
      style={{ width: `${width - 24}px`, height: `${height - 32}px` }}
      onMouseDown={(event) => logMouseEvent("terminal_mouse_down", event)}
      onMouseMove={(event) => logMouseEvent("terminal_mouse_move", event)}
      onMouseUp={(event) => logMouseEvent("terminal_mouse_up", event)}
      onMouseLeave={(event) => logMouseEvent("terminal_mouse_leave", event)}
      onClick={(event) => logMouseEvent("terminal_click", event)}
    />
  );
}
