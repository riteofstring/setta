import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import { useSectionInfos } from "models/info/sectionInfos";
import React, { useEffect, useRef } from "react";
import { useStore } from "reactflow";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { BACKEND_PORT, DOMAIN } from "z_utils/addresses";
import { createNewId } from "z_utils/utils";
import { theme } from "./Terminal/TerminalTheme";

export const TERMINAL_WEBSOCKETS = {};
export const INITIAL_MESSAGE = {};
let pendingMsg = null;

function newTerminalWebsocket(sectionId) {
  const id = createNewId();
  const wsTerminalAddress = `ws://${DOMAIN}:${BACKEND_PORT}/terminal/${id}`;
  const ws = new WebSocket(wsTerminalAddress);
  ws.addEventListener("open", () => {
    if (pendingMsg) {
      ws.send(pendingMsg);
      pendingMsg = null;
    }
    if (INITIAL_MESSAGE[sectionId]) {
      ws.send(INITIAL_MESSAGE[sectionId]);
      delete INITIAL_MESSAGE[sectionId];
    }
  });
  ws.addEventListener("close", () => {
    delete TERMINAL_WEBSOCKETS[id];
  });
  ws.addEventListener("error", () => {
    delete TERMINAL_WEBSOCKETS[id];
  });

  TERMINAL_WEBSOCKETS[id] = ws;

  return {
    disposeWs: () => {
      ws.close();
    },
    ws,
  };
}

function _TerminalArea({ sectionId }) {
  const { width, height } = useSectionInfos((x) => x.x[sectionId].size);
  const terminalRef = useTerminal({ sectionId, width, height });

  window.reactFlowZoom = useStore((x) => x.transform[2]);

  return (
    <div
      ref={terminalRef}
      className="nodrag nowheel card-terminal"
      style={{ width: `${width - 48}px`, height: `${height - 64}px` }}
    />
  );
}

export const TerminalArea = React.memo(_TerminalArea);

function useFitAddon() {
  const fitAddon = useRef(null);

  if (!fitAddon.current) {
    fitAddon.current = new FitAddon();
  }

  return fitAddon.current;
}

function useTerminal({ sectionId, width, height }) {
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

    const { disposeWs, ws } = newTerminalWebsocket(sectionId);
    const attachAddon = new AttachAddon(ws);
    terminal.loadAddon(attachAddon);

    terminal.onResize((size) => {
      // Send the new size to the backend
      const message = JSON.stringify({
        type: "resize",
        cols: size.cols,
        rows: size.rows,
      });
      if (ws.readyState === 1) {
        ws.send(message);
      } else {
        pendingMsg = message;
      }
    });

    return () => {
      // Causes Uncaught TypeError: Cannot read properties of undefined (reading 'dimensions')
      // https://github.com/xtermjs/xterm.js/issues/4775
      disposeWs();
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    fitAddon.fit();
  }, [width, height]);

  return terminalRef;
}
