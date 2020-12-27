import React, { useState, useLayoutEffect } from "react";
import { Box } from "@chakra-ui/react";
// import { Terminal } from "xterm";
import Xterm from "./Terminal";
import { FitAddon } from "xterm-addon-fit";
import "./xterm.module.css";
import "./TerminalPage.module.css";
import { Resizable } from "re-resizable";
import ResizeObserver from "react-resize-observer";
import c from "ansi-colors";

const fitAddon = new FitAddon();

const TerminalPage = () => {
  const xtermRef = React.createRef();
  const [state, setState] = useState("")
  useLayoutEffect(() => {
    // Add the starting text to the terminal
    xtermRef.current.terminal.writeln(
      "Please enter any string then press enter:"
    );
    xtermRef.current.terminal.write("echo> ");
  }, []);

  return (
    <Box position="absolute" top="200px" width="50vw" height="50vh">
      <div className="TerminalPage" style={{ background: "" }}>
        <h1>Xterm.js</h1>
        <Xterm
          ref={xtermRef}
          onData={(data) => {
            const code = data.charCodeAt(0);
            // If the user hits empty and there is something typed echo it.
            if (code === 13 && state.length > 0) {
              xtermRef.current.terminal.write(
                "\r\nYou typed: '" + state + "'\r\n"
              );
              xtermRef.current.terminal.write("echo> ");
              setState("");
            } else if (code < 32 || code === 127) {
              // Disable control Keys such as arrow keys
              return;
            } else {
              // Add general key press characters to the terminal
              xtermRef.current.terminal.write(data);
              setState(state + data);
            }
          }}
        />
      </div>
    </Box>
  );
};

export default TerminalPage;
