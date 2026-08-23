import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from "react";
import { useLayoutEffect, useRef } from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "@setta/workspace";

import { mountGeneratedPythonTerminal } from "./generatedPythonTerminalClient";
import { useGeneratedPythonTerminal } from "./generatedPythonTerminalContext";

export function GeneratedPythonTerminalHeaderControls() {
  const { actions, state } = useGeneratedPythonTerminal();
  const terminalLabel =
    state.status === "absent"
      ? "Create terminal"
      : state.status === "hidden"
        ? "Show terminal"
        : "Hide terminal";
  const terminalAction =
    state.status === "absent"
      ? actions.create
      : state.status === "hidden"
        ? actions.show
        : actions.hide;

  return (
    <>
      <button
        aria-label="Run this code block"
        className={`${NO_DRAG_CLASS_NAME} python-canvas-generated-python-run-control`}
        data-generated-python-run
        onClick={actions.run}
        title="Run this code block"
        type="button"
      >
        <PlayIcon />
      </button>
      <button
        aria-label={terminalLabel}
        aria-pressed={state.status === "visible"}
        className={`${NO_DRAG_CLASS_NAME} python-canvas-generated-python-terminal-control ${
          state.status === "visible"
            ? "python-canvas-generated-python-terminal-control-visible"
            : ""
        }`}
        data-attached-terminal-toggle
        data-generated-python-terminal-toggle
        disabled={state.status === "absent" && state.creating}
        onClick={terminalAction}
        title={terminalLabel}
        type="button"
      >
        <TerminalIcon />
      </button>
    </>
  );
}

export function GeneratedPythonTerminalSection({
  editor,
}: {
  editor: ReactNode;
}) {
  return (
    <div className="python-canvas-generated-python-section">
      <div className="python-canvas-generated-python-editor">{editor}</div>
    </div>
  );
}

export function GeneratedPythonTerminalAttachment({
  ownerWidth,
}: {
  ownerWidth: number | "auto";
}) {
  const { actions, state } = useGeneratedPythonTerminal();
  if (
    state.status !== "visible" ||
    state.projectId === null ||
    state.sessionKey === null
  ) {
    return null;
  }
  return (
    <GeneratedPythonTerminalPane
      onResize={actions.resize}
      onStreamError={actions.reportStreamError}
      onTrash={actions.close}
      ownerWidth={ownerWidth}
      projectId={state.projectId}
      sessionKey={state.sessionKey}
      terminalHeight={state.terminalHeight}
    />
  );
}

function GeneratedPythonTerminalPane({
  onResize,
  onStreamError,
  onTrash,
  ownerWidth,
  projectId,
  sessionKey,
  terminalHeight,
}: {
  onResize: (height: number) => void;
  onStreamError: (message: string) => void;
  onTrash: () => void;
  ownerWidth: number | "auto";
  projectId: string;
  sessionKey: string;
  terminalHeight: number;
}) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const container = terminalRef.current;
    if (container === null) {
      return;
    }
    return mountGeneratedPythonTerminal({
      container,
      onError: onStreamError,
      projectId,
      sessionKey,
    });
  }, [onStreamError, projectId, sessionKey]);

  return (
    <section
      aria-label="Generated Python terminal"
      className="python-canvas-generated-python-terminal-pane"
      data-workspace-attached-section
      style={terminalPaneStyle(terminalHeight, ownerWidth)}
    >
      <TerminalResizeHandle
        onResize={onResize}
        terminalHeight={terminalHeight}
      />
      <button
        aria-label="Trash terminal"
        className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} python-canvas-generated-python-terminal-trash`}
        data-attached-terminal-trash
        onClick={onTrash}
        title="Trash terminal"
        type="button"
      >
        <TrashIcon />
      </button>
      <div
        className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} python-canvas-generated-python-terminal-surface`}
        data-attached-terminal-section-id="generated-python-runtime"
        data-section-main-editor
        ref={terminalRef}
      />
    </section>
  );
}

function terminalPaneStyle(
  terminalHeight: number,
  ownerWidth: number | "auto",
): CSSProperties {
  return {
    blockSize: `${String(terminalHeight)}px`,
    inlineSize: ownerWidth === "auto" ? ownerWidth : `${String(ownerWidth)}px`,
  };
}

function TerminalResizeHandle({
  onResize,
  terminalHeight,
}: {
  onResize: (height: number) => void;
  terminalHeight: number;
}) {
  const dragRef = useRef<{
    startHeight: number;
    startY: number;
  } | null>(null);

  function resizeFromPointer(event: globalThis.PointerEvent) {
    const drag = dragRef.current;
    if (drag === null) {
      return;
    }
    onResize(drag.startHeight + event.clientY - drag.startY);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      startHeight: terminalHeight,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeFromPointer(event.nativeEvent);
  }

  function finishPointerResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeFromPointer(event.nativeEvent);
    dragRef.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 25 : 10;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      onResize(terminalHeight - step);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      onResize(terminalHeight + step);
    }
  }

  return (
    <div
      aria-label="Resize terminal height"
      aria-orientation="horizontal"
      aria-valuemin={100}
      aria-valuenow={terminalHeight}
      className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} python-canvas-generated-python-terminal-splitter`}
      onKeyDown={onKeyDown}
      onPointerCancel={finishPointerResize}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointerResize}
      role="separator"
      tabIndex={0}
    />
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <path d="M7.75194 5.43872L18.2596 11.5682C18.4981 11.7073 18.5787 12.0135 18.4396 12.252C18.3961 12.3265 18.3341 12.3885 18.2596 12.432L7.75194 18.5615C7.51341 18.7006 7.20725 18.62 7.06811 18.3815C7.0235 18.305 7 18.2181 7 18.1296V5.87061C7 5.59446 7.22386 5.37061 7.5 5.37061C7.58853 5.37061 7.67547 5.39411 7.75194 5.43872Z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 640 512">
      <path d="M257.981 272.971L63.638 467.314c-9.373 9.373-24.569 9.373-33.941 0L7.029 444.647c-9.357-9.357-9.375-24.522-.04-33.901L161.011 256 6.99 101.255c-9.335-9.379-9.317-24.544.04-33.901l22.667-22.667c9.373-9.373 24.569-9.373 33.941 0L257.981 239.03c9.373 9.372 9.373 24.568 0 33.941zM640 456v-32c0-13.255-10.745-24-24-24H312c-13.255 0-24 10.745-24 24v32c0 13.255 10.745 24 24 24h304c13.255 0 24-10.745 24-24z" />
    </svg>
  );
}

function TrashIcon() {
  return <i aria-hidden="true" className="python-canvas-gg-trash" />;
}
