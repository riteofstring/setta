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
export const INITIAL_MESSAGES = {};

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
    console.log("new Terminal!");
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current); // Attach the terminal to the div

    const { ws, wsId } = newTerminalWebsocket(sectionId);
    const attachAddon = new AttachAddon(ws);
    console.log("new attach add on");
    terminal.loadAddon(attachAddon);

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
        addTerminalInitialMessage(wsId, message);
      }
    });

    return () => {
      if (ws.readyState === 1) {
        console.log("closing websocket");
        ws.close();
        terminal.dispose();
      } else {
        ws.addEventListener("open", () => {
          console.log("websocket opened, now closing");
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
  console.log("NEW WEBSOCKET");
  const projectConfigId = useProjectConfig.getState().id;
  const id = createNewId();
  const wsTerminalAddress = `${URLS.WEBSOCKET}${pseudoTemplatedStr(C.ROUTE_TERMINAL, { projectConfigId, sectionId, id })}`;
  const ws = new WebSocket(wsTerminalAddress);
  ws.addEventListener("open", () => {
    if (INITIAL_MESSAGES[id]?.length > 0) {
      for (const initialMessage of INITIAL_MESSAGES[id]) {
        // hack to get backend to receive distinct messages rather than 1 grouped message
        console.log("sending", initialMessage);
        setTimeout(() => {
          ws.send(initialMessage);
        }, 0);
      }
      INITIAL_MESSAGES[id] = [];
    }
  });
  ws.addEventListener("close", () => {
    console.log("websocket closed");
    delete TERMINAL_WEBSOCKETS[id];
    delete INITIAL_MESSAGES[id];
  });
  ws.addEventListener("error", () => {
    delete TERMINAL_WEBSOCKETS[id];
    delete INITIAL_MESSAGES[id];
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

export function addTerminalInitialMessage(id, msg) {
  if (!(id in INITIAL_MESSAGES)) {
    INITIAL_MESSAGES[id] = [];
  }
  if (!INITIAL_MESSAGES[id].includes(msg)) {
    INITIAL_MESSAGES[id].push(msg);
  }
}
