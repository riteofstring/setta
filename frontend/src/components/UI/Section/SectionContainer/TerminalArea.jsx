import { FitAddon } from "@xterm/addon-fit";
import { useSectionInfos } from "models/info/sectionInfos";
import React, { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

function _TerminalArea({ sectionId }) {
  const terminalRef = useRef(null); // Ref for the terminal container
  const { width, height } = useSectionInfos((x) => x.x[sectionId].size);

  useEffect(() => {
    const terminal = new Terminal(); // Instantiate the terminal
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current); // Attach the terminal to the div
    fitAddon.fit();

    // Optional: Load addons here
    // ...

    return () => {
      terminal.dispose(); // Cleanup the terminal on component unmount
    };
  }, []);

  return (
    <div
      ref={terminalRef}
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}

export const TerminalArea = React.memo(_TerminalArea);
