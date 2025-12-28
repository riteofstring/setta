import { useEffect, useRef } from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { C } from "utils/c";
import { replaceAddressParams } from "utils/endpointUtils";
import { RouteEnum } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  getWebsocketAuthProtocol,
  getWebsocketBaseUrl,
} from "utils/runtimeConfig";
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
const TERMINAL_WEBSOCKETS: Record<string, WebSocket[]> = {};
const INITIAL_MESSAGES: Record<string, string[]> = {}; // maps from sectionId to a list of messages

type UseTerminalProps = {
  sectionId: string;
  width: number;
  height: number;
  setHasScrollbar: (hasScrollbar: boolean) => void;
};

export function useTerminal({
  sectionId,
  width,
  height,
  setHasScrollbar,
}: UseTerminalProps) {
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
    };
  }, []);

  useEffect(() => {
    fitAddon.fit();
  }, [width, height]);

  return terminalRef;
}

function newTerminalWebsocket(sectionId: string) {
  const projectConfigId = getCurrProjectConfigId();
  const id = createNewId();
  const websocketBaseUrl = getWebsocketBaseUrl();
  const authProtocol = getWebsocketAuthProtocol();
  const wsTerminalAddress = `${websocketBaseUrl}${replaceAddressParams(RouteEnum.TERMINAL, { projectConfigId, sectionId, id })}`;
  const ws = new WebSocket(wsTerminalAddress, [authProtocol]);
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

function addTerminalInitialMessage(sectionId: string, msg: string) {
  if (!(sectionId in INITIAL_MESSAGES)) {
    INITIAL_MESSAGES[sectionId] = [];
  }
  if (!INITIAL_MESSAGES[sectionId].includes(msg)) {
    INITIAL_MESSAGES[sectionId].push(msg);
  }
}

function removeWsFromArray(wsList: WebSocket[], ws: WebSocket) {
  return wsList.filter((item) => item !== ws);
}
