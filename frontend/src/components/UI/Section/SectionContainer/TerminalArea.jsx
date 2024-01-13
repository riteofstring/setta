import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import { useSectionInfos } from "models/info/sectionInfos";
import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { BACKEND_PORT, DOMAIN } from "z_utils/addresses";
import { createNewId } from "z_utils/utils";
import { theme } from "./Terminal/TerminalTheme";

function _TerminalArea({ sectionId }) {
  const { width, height } = useSectionInfos((x) => x.x[sectionId].size);
  const terminalRef = useTerminal({ width, height });

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

function useTerminal({ width, height }) {
  const terminalRef = useRef(null); // Ref for the terminal container
  const fitAddon = useFitAddon();
  const [websocketOpen, setWebsocketOpen] = useState(false);
  const [pendingMsg, setPendingMsg] = useState(null);

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

    const id = createNewId();
    const wsTerminalAddress = `ws://${DOMAIN}:${BACKEND_PORT}/terminal/${id}`;
    const terminalWebsocket = new WebSocket(wsTerminalAddress);
    const attachAddon = new AttachAddon(terminalWebsocket);
    terminalWebsocket.addEventListener("open", () => {
      setWebsocketOpen(true);
      terminal.loadAddon(attachAddon);
      if (pendingMsg) {
        terminalWebsocket.send(message);
      }
    });
    terminalWebsocket.addEventListener("close", () => setWebsocketOpen(false));

    terminal.onResize((size) => {
      // Send the new size to the backend
      const message = JSON.stringify({
        type: "resize",
        cols: size.cols,
        rows: size.rows,
      });
      if (websocketOpen) {
        terminalWebsocket.send(message);
      } else {
        setPendingMsg(message);
      }
    });

    return () => {
      // Causes Uncaught TypeError: Cannot read properties of undefined (reading 'dimensions')
      // https://github.com/xtermjs/xterm.js/issues/4775
      terminal.dispose();
      terminalWebsocket.close();
    };
  }, []);

  useEffect(() => {
    fitAddon.fit();
  }, [width, height]);

  return terminalRef;
}
