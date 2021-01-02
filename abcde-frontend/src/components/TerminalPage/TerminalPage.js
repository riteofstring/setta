import React, { useState, useLayoutEffect, useEffect } from "react";
import { useStoreState } from "easy-peasy";
import { Box } from "@chakra-ui/react";
// import { Terminal } from "xterm";
import Xterm from "./Terminal";
import { FitAddon } from "xterm-addon-fit";
import "./xterm.module.css";
import "./TerminalPage.module.css";
import { Resizable } from "re-resizable";
import ResizeObserver from "react-resize-observer";
import c from "ansi-colors";
import { ipcRenderer } from "../../utils/constants";

const fitAddon = new FitAddon();

const TerminalPage = () => {
  const [terminalData, setTerminalData] = useState("");
  const xtermRef = React.createRef();

  ipcRenderer.on("terminal.incomingData", (event, data) => {
    setTerminalData(data);
  });

  useEffect(() => {
    xtermRef.current.terminal.write(terminalData);
  }, [terminalData]);

  return (
    <Box position="absolute" top="200px" width="50vw" height="50vh">
      <div className="TerminalPage" style={{ background: "" }}>
        <h1>Xterm.js</h1>
        <Xterm ref={xtermRef} />
      </div>
    </Box>
  );
};

export default TerminalPage;
