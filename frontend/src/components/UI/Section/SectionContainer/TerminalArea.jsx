import C from "constants/constants.json";
import { pseudoTemplatedStr } from "dbRequests/utils";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import React, { useEffect, useRef } from "react";
import { URLS } from "utils/constants";
import { Terminal } from "xterm";
import { AttachAddon } from "xterm-addon-attach";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { useReactFlow } from "xyflow/core/store";
import { theme } from "./Terminal/TerminalTheme";

export const TERMINAL_WEBSOCKETS = {};
export const INITIAL_MESSAGE = {};
const PENDING_MSG = {};

function newTerminalWebsocket(sectionId) {
  let ws;
  if (TERMINAL_WEBSOCKETS[sectionId]) {
    ws = TERMINAL_WEBSOCKETS[sectionId];
  } else {
    const projectConfigId = useProjectConfig.getState().id;
    const wsTerminalAddress = `${URLS.WEBSOCKET}${pseudoTemplatedStr(C.ROUTE_TERMINAL, { projectConfigId, id: sectionId })}`;
    ws = new WebSocket(wsTerminalAddress);
    ws.addEventListener("open", () => {
      if (PENDING_MSG[sectionId]) {
        ws.send(PENDING_MSG[sectionId]);
        PENDING_MSG[sectionId] = null;
      }
      if (INITIAL_MESSAGE[sectionId]) {
        ws.send(INITIAL_MESSAGE[sectionId]);
        delete INITIAL_MESSAGE[sectionId];
      }
    });
    ws.addEventListener("close", () => {
      delete TERMINAL_WEBSOCKETS[sectionId];
    });
    ws.addEventListener("error", () => {
      delete TERMINAL_WEBSOCKETS[sectionId];
    });

    TERMINAL_WEBSOCKETS[sectionId] = ws;
  }

  return {
    disposeWs: () => {
      if (!(sectionId in useSectionInfos.getState().x)) {
        ws.close();
      }
    },
    ws,
  };
}

function _TerminalArea({ sectionId }) {
  const { width, height } = useSectionInfos((x) => x.x[sectionId].size);
  const terminalRef = useTerminal({ sectionId, width, height });

  window.reactFlowZoom = useReactFlow((x) => x.transform[2]);

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
        PENDING_MSG[sectionId] = message;
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
