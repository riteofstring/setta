import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import { useSectionInfos } from "models/info/sectionInfos";
import React, { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { BACKEND_PORT, DOMAIN } from "z_utils/addresses";

const wsTerminalAddress = `ws://${DOMAIN}:${BACKEND_PORT}/terminal`;
const fitAddon = new FitAddon();
const attachAddon = new AttachAddon(new WebSocket(wsTerminalAddress));

function _TerminalArea({ sectionId }) {
  const terminalRef = useRef(null); // Ref for the terminal container
  const { width, height } = useSectionInfos((x) => x.x[sectionId].size);

  useEffect(() => {
    const terminal = new Terminal({ cursorBlink: true }); // Instantiate the terminal
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(attachAddon);
    terminal.open(terminalRef.current); // Attach the terminal to the div

    // Handler for input data
    terminal.onData((data) => {
      console.log(data);
    });

    return () => {
      // Causes Uncaught TypeError: Cannot read properties of undefined (reading 'dimensions')
      // https://github.com/xtermjs/xterm.js/issues/4775
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    fitAddon.fit();
  }, [width, height]);

  return (
    <div
      ref={terminalRef}
      className="nodrag nowheel"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}

export const TerminalArea = React.memo(_TerminalArea);
