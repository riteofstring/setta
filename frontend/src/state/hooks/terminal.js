import C from "constants/constants.json";
import { useEffect, useRef } from "react";
import { pseudoTemplatedStr } from "requests/utils";
import { useProjectConfig } from "state/definitions";
import { URLS } from "utils/constants";
import { createNewId } from "utils/idNameCreation";
import { Terminal } from "xterm";
import { AttachAddon } from "xterm-addon-attach";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

export const TERMINAL_WEBSOCKETS = {};
export const INITIAL_MESSAGES = {}; // keys are sectionId

export function useTerminal({ sectionId, width, height }) {
  const terminalRef = useRef(null); // Ref for the terminal container
  const fitAddon = useFitAddon();

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      theme: theme,
      // fontFamily: fontFamily,
      // letterSpacing: "0",
      // fontSize: "14",
    }); // Instantiate the terminal
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current); // Attach the terminal to the div

    const { ws, wsId } = newTerminalWebsocket(sectionId);

    terminal.onResize((size) => {
      // Send the new size to the backend
      const message = JSON.stringify({
        messageType: "resize",
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

    return () => {
      if (ws.readyState === 1) {
        ws.close();
        terminal.dispose();
      } else {
        ws.addEventListener("open", () => {
          ws.close();
          // Causes Uncaught TypeError: Cannot read properties of undefined (reading 'dimensions')
          // https://github.com/xtermjs/xterm.js/issues/4775
          terminal.dispose();
        });
      }
    };
  }, []);

  useEffect(() => {
    fitAddon.fit();
  }, [width, height]);

  return terminalRef;
}

function useFitAddon() {
  const fitAddon = useRef(null);

  if (!fitAddon.current) {
    fitAddon.current = new FitAddon();
  }

  return fitAddon.current;
}

function newTerminalWebsocket(sectionId) {
  const projectConfigId = useProjectConfig.getState().id;
  const id = createNewId();
  const wsTerminalAddress = `${URLS.WEBSOCKET}${pseudoTemplatedStr(C.ROUTE_TERMINAL, { projectConfigId, sectionId, id })}`;
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
  ws.addEventListener("close", () => {
    delete TERMINAL_WEBSOCKETS[id];
  });
  ws.addEventListener("error", () => {
    delete TERMINAL_WEBSOCKETS[id];
  });

  TERMINAL_WEBSOCKETS[id] = ws;
  // if ((!sectionId) in SECTION_WEBSOCKET_IDS) {
  //   SECTION_WEBSOCKET_IDS[sectionId] = [];
  // }
  // SECTION_WEBSOCKET_IDS[sectionId].push(id);

  return { ws, wsId: id };
}

const theme = {
  foreground: "#B8C2D5",
  // background: "#0D1016",
  background: "#06070A",
  cursor: "#B8C2D5",
  selection: "#49483e",
  black: "#272822",
  red: "#f92672",
  green: "#a6e22e",
  yellow: "#f4bf75",
  blue: "#66d9ef",
  magenta: "#ae81ff",
  cyan: "#a1efe4",
  white: "#f8f8f2",
  brightBlack: "#75715e",
  brightRed: "#f92672",
  brightGreen: "#a6e22e",
  brightYellow: "#f4bf75",
  brightBlue: "#66d9ef",
  brightMagenta: "#ae81ff",
  brightCyan: "#a1efe4",
  brightWhite: "#f9f8f5",
};

// const fontFamily = {
//   fontFamily:
//     'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;',
// };

export function addTerminalInitialMessage(sectionId, msg) {
  if (!(sectionId in INITIAL_MESSAGES)) {
    INITIAL_MESSAGES[sectionId] = [];
  }
  if (!INITIAL_MESSAGES[sectionId].includes(msg)) {
    INITIAL_MESSAGES[sectionId].push(msg);
  }
}
