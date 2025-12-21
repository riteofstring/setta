import { useEffect, useRef } from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { C } from "utils/c";
import { C_ADDRESSES } from "utils/c_addresses";
import { replaceAddressParams } from "utils/endpointUtils";
import { RouteEnum } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { Terminal } from "xterm";
import { AttachAddon } from "xterm-addon-attach";
import "xterm/css/xterm.css";
import { logTerminalLockDebug } from "utils/terminalLockDebug";
import {
  scrollSensitivityUpdater,
  terminalCleanup,
  terminalTheme,
  useFitAddon,
} from "./utils";

// Maps from sectionId to a list of websocket connections.
// There should only be 1 websocket for a given section.
// But in case of double renders (basically just StrictMode),
// this keeps a list of websockets, so we can add the new websocket
// while the old one gets deleted.
const TERMINAL_WEBSOCKETS = {};
const INITIAL_MESSAGES = {}; // maps from sectionId to a list of messages

export function useTerminal({ sectionId, width, height, setHasScrollbar }) {
  const terminalRef = useRef(null); // Ref for the terminal container
  const fitAddon = useFitAddon();

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      theme: terminalTheme,
      // fontFamily: fontFamily,
      // letterSpacing: "0",
      // fontSize: "14",
    }); // Instantiate the terminal
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current); // Attach the terminal to the div

    terminal.onSelectionChange(() => {
      logTerminalLockDebug("terminal_selection_change", {
        sectionId,
        hasSelection: terminal.hasSelection(),
        selectionLength: terminal.getSelection().length,
      });
    });

    const pointerMoveThrottleMs = 150;
    let lastPointerMoveTs = 0;

    function isPositionLocked() {
      const state = useProjectState.getState();
      return Boolean(state.sections?.[sectionId]?.positionAndSizeLocked);
    }

    function getSelectionSnapshot() {
      if (typeof window === "undefined") {
        return null;
      }
      const selection = window.getSelection();
      if (!selection) {
        return null;
      }
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      return {
        type: selection.type,
        isCollapsed: selection.isCollapsed,
        rangeCount: selection.rangeCount,
        anchorNodeName: anchorNode?.nodeName ?? null,
        focusNodeName: focusNode?.nodeName ?? null,
        anchorParentClassName:
          anchorNode?.parentElement?.className ?? null,
        focusParentClassName: focusNode?.parentElement?.className ?? null,
      };
    }

    function logPointerEvent(name: string, event: PointerEvent) {
      if (!isPositionLocked()) {
        return;
      }
      if (name === "terminal_pointer_move") {
        const now =
          typeof performance === "undefined" ? Date.now() : performance.now();
        if (now - lastPointerMoveTs < pointerMoveThrottleMs) {
          return;
        }
        lastPointerMoveTs = now;
      }
      const activeElement =
        typeof document !== "undefined" ? document.activeElement : null;
      logTerminalLockDebug(name, {
        sectionId,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: event.button,
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        targetTag:
          event.target instanceof HTMLElement ? event.target.tagName : null,
        targetClassName:
          event.target instanceof HTMLElement ? event.target.className : null,
        selectionSnapshot: getSelectionSnapshot(),
        activeElementTag:
          activeElement instanceof HTMLElement ? activeElement.tagName : null,
        activeElementClassName:
          activeElement instanceof HTMLElement ? activeElement.className : null,
      });
    }

    function onSelectionChange() {
      if (!isPositionLocked()) {
        return;
      }
      logTerminalLockDebug("document_selection_change", {
        sectionId,
        selectionSnapshot: getSelectionSnapshot(),
      });
    }

    const terminalElement = terminal.element;
    const helperTextarea = terminalElement?.querySelector(
      "textarea.xterm-helper-textarea",
    );
    const terminalContainer = terminalRef.current;

    logTerminalLockDebug("terminal_pointer_targets", {
      sectionId,
      hasTerminalElement: Boolean(terminalElement),
      hasHelperTextarea: Boolean(helperTextarea),
      hasTerminalContainer: Boolean(terminalContainer),
    });

    const handlePointerDown = (event: PointerEvent) => {
      logPointerEvent("terminal_pointer_down", event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      logPointerEvent("terminal_pointer_up", event);
    };
    const handlePointerMove = (event: PointerEvent) => {
      logPointerEvent("terminal_pointer_move", event);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      logPointerEvent("terminal_pointer_cancel", event);
    };

    const pointerTargets = new Set<EventTarget>();
    if (terminalContainer) {
      pointerTargets.add(terminalContainer);
    }
    if (terminalElement && terminalElement !== terminalContainer) {
      pointerTargets.add(terminalElement);
    }
    if (
      helperTextarea &&
      helperTextarea !== terminalElement &&
      helperTextarea !== terminalContainer
    ) {
      pointerTargets.add(helperTextarea);
    }

    pointerTargets.forEach((target) => {
      target.addEventListener("pointerdown", handlePointerDown, true);
      target.addEventListener("pointerup", handlePointerUp, true);
      target.addEventListener("pointermove", handlePointerMove, true);
      target.addEventListener("pointercancel", handlePointerCancel, true);
    });

    if (typeof document !== "undefined") {
      document.addEventListener("selectionchange", onSelectionChange, true);
    }

    const { ws } = newTerminalWebsocket(sectionId);

    terminal.onResize((size) => {
      // Send the new size to the backend
      const message = JSON.stringify({
        messageType: C.WS_TERMINAL_RESIZE,
        cols: size.cols,
        rows: size.rows,
      });
      if (ws.readyState === 1) {
        ws.send(message);
      } else {
        addTerminalInitialMessage(sectionId, message);
      }
    });

    function onInitialMessage(message) {
      if (message.data === C.SETTA_TERMINAL_READY) {
        const attachAddon = new AttachAddon(ws);
        terminal.loadAddon(attachAddon);
        ws.removeEventListener("message", onInitialMessage);
      }
    }

    ws.addEventListener("message", onInitialMessage);

    const unsub = scrollSensitivityUpdater(terminal, setHasScrollbar);

    return () => {
      terminalCleanup(ws, terminal);
      unsub();
      pointerTargets.forEach((target) => {
        target.removeEventListener("pointerdown", handlePointerDown, true);
        target.removeEventListener("pointerup", handlePointerUp, true);
        target.removeEventListener("pointermove", handlePointerMove, true);
        target.removeEventListener("pointercancel", handlePointerCancel, true);
      });
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "selectionchange",
          onSelectionChange,
          true,
        );
      }
    };
  }, []);

  useEffect(() => {
    fitAddon.fit();
  }, [width, height]);

  return terminalRef;
}

function newTerminalWebsocket(sectionId) {
  const projectConfigId = getCurrProjectConfigId();
  const id = createNewId();
  const wsTerminalAddress = `${C_ADDRESSES.WEBSOCKET}${replaceAddressParams(RouteEnum.TERMINAL, { projectConfigId, sectionId, id })}`;
  const ws = new WebSocket(wsTerminalAddress);
  ws.addEventListener("open", async () => {
    if (INITIAL_MESSAGES[sectionId]?.length > 0) {
      const sentMessageIdx = [];
      for (const [idx, initialMessage] of INITIAL_MESSAGES[
        sectionId
      ].entries()) {
        // hack to get backend to receive distinct messages rather than 1 grouped message
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (ws.readyState === 1) {
          ws.send(initialMessage);
          sentMessageIdx.push(idx);
        }
      }
      INITIAL_MESSAGES[sectionId] = INITIAL_MESSAGES[sectionId].filter(
        (x, idx) => !sentMessageIdx.includes(idx),
      );
    }
  });

  function cleanupTerminalWebsockets() {
    if (sectionId in TERMINAL_WEBSOCKETS) {
      TERMINAL_WEBSOCKETS[sectionId] = removeWsFromArray(
        TERMINAL_WEBSOCKETS[sectionId],
        ws,
      );
    }
  }

  ws.addEventListener("close", cleanupTerminalWebsockets);
  ws.addEventListener("error", cleanupTerminalWebsockets);

  if (!(sectionId in TERMINAL_WEBSOCKETS)) {
    TERMINAL_WEBSOCKETS[sectionId] = [];
  }
  TERMINAL_WEBSOCKETS[sectionId].push(ws);

  return { ws, wsId: id };
}

// const fontFamily = {
//   fontFamily:
//     'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;',
// };

function addTerminalInitialMessage(sectionId, msg) {
  if (!(sectionId in INITIAL_MESSAGES)) {
    INITIAL_MESSAGES[sectionId] = [];
  }
  if (!INITIAL_MESSAGES[sectionId].includes(msg)) {
    INITIAL_MESSAGES[sectionId].push(msg);
  }
}

function removeWsFromArray(x, ws) {
  return x.filter((w) => w !== ws);
}
