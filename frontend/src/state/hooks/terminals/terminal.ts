import { useEffect, useRef } from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareSession } from "state/definitions";
import { C } from "utils/c";
import { C_ADDRESSES } from "utils/c_addresses";
import { replaceAddressParams } from "utils/endpointUtils";
import { RouteEnum } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  clearPendingSectionTextFocus,
  isPendingSectionTextFocus,
} from "utils/tabbingLogic";
import { Terminal } from "xterm";
import { AttachAddon } from "xterm-addon-attach";
import "xterm/css/xterm.css";
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

export function useTerminal({
  sectionId,
  width,
  height,
  setHasScrollbar,
}: {
  sectionId: string;
  width: number;
  height: number;
  setHasScrollbar: (value: boolean) => void;
}) {
  const terminalRef = useRef(null); // Ref for the terminal container
  const terminalReadyRef = useRef(false);
  const fitAddon = useFitAddon();
  const isShareMode = useShareSession((x) => x.isShareMode);
  const shareSessionId = useShareSession((x) => x.shareSessionId);

  useEffect(() => {
    terminalReadyRef.current = false;
    if (isShareMode && !shareSessionId) {
      return;
    }
    const terminal = new Terminal({
      cursorBlink: true,
      theme: terminalTheme,
      disableStdin: isShareMode,
      // fontFamily: fontFamily,
      // letterSpacing: "0",
      // fontSize: "14",
    }); // Instantiate the terminal
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current); // Attach the terminal to the div

    const focusTerminalInput = (attempt = 0) => {
      if (!isPendingSectionTextFocus(sectionId)) {
        return;
      }
      const focusTarget = terminalRef.current?.querySelector?.(
        ".xterm-helper-textarea, .xterm textarea",
      );
      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus({ preventScroll: true });
        terminal.focus();
        const active = document.activeElement;
        if (
          terminalReadyRef.current &&
          terminalRef.current &&
          active instanceof HTMLElement &&
          terminalRef.current.contains(active)
        ) {
          clearPendingSectionTextFocus(sectionId);
          return;
        }
      }
      terminal.focus();
      if (attempt < 240) {
        requestAnimationFrame(() => focusTerminalInput(attempt + 1));
      }
    };

    if (!isShareMode && isPendingSectionTextFocus(sectionId)) {
      requestAnimationFrame(() => focusTerminalInput());
    }

    const { ws } = newTerminalWebsocket(sectionId, shareSessionId);

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
        terminalReadyRef.current = true;
        const attachAddon = new AttachAddon(ws, {
          bidirectional: !isShareMode,
        });
        terminal.loadAddon(attachAddon);
        if (!isShareMode && isPendingSectionTextFocus(sectionId)) {
          requestAnimationFrame(() => focusTerminalInput());
        }
        ws.removeEventListener("message", onInitialMessage);
      }
    }

    ws.addEventListener("message", onInitialMessage);

    const unsub = scrollSensitivityUpdater(terminal, setHasScrollbar);

    return () => {
      terminalCleanup(ws, terminal);
      unsub();
    };
  }, [isShareMode, shareSessionId]);

  useEffect(() => {
    fitAddon.fit();
  }, [width, height]);

  return terminalRef;
}

function newTerminalWebsocket(
  sectionId: string,
  shareSessionId: string | null,
) {
  const projectConfigId = getCurrProjectConfigId();
  const id = createNewId();
  const baseAddress = `${C_ADDRESSES.WEBSOCKET}${replaceAddressParams(
    RouteEnum.TERMINAL,
    { projectConfigId, sectionId, id },
  )}`;
  const wsTerminalAddress = shareSessionId
    ? `${baseAddress}?shareSessionId=${encodeURIComponent(shareSessionId)}`
    : baseAddress;
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
