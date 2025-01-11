import C from "constants/constants.json";
import { useEffect, useRef } from "react";
import { useMisc } from "state/definitions";
import { URLS } from "utils/constants";
import { Terminal } from "xterm";
import { AttachAddon } from "xterm-addon-attach";
import "xterm/css/xterm.css";
import { terminalTheme, useFitAddon } from "./terminal";

export function useTerminalReadOnly({ width, height, setHasScrollbar }) {
  const terminalRef = useRef(null); // Ref for the terminal container
  const fitAddon = useFitAddon();

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: false,
      theme: terminalTheme,
      disableStdin: true,
    });
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);
    const ws = new WebSocket(
      `${URLS.WEBSOCKET}${C.ROUTE_IN_MEMORY_FN_STDOUT_WEBSOCKET}`,
    );

    const attachAddon = new AttachAddon(ws);
    terminal.loadAddon(attachAddon);

    terminal.onRender(() => {
      setHasScrollbar(terminal.buffer.active.baseY > 0);
    });

    // Even though react flow calls preventDefault and stopPropagation when in pan scrolling mode,
    // xterm still picks up the scrolling. So this sets scrollSensitivity to a small number to disable scrolling when already moving via trackpad.
    const unsub = useMisc.subscribe(
      (x) => x.isPanScrolling,
      (isPanScrolling) => {
        if (isPanScrolling) {
          // can't make it 0
          terminal.options.scrollSensitivity = Number.MIN_VALUE;
        } else {
          terminal.options.scrollSensitivity = 1;
        }
      },
    );

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

      unsub();
    };
  }, []);

  useEffect(() => {
    fitAddon.fit();
  }, [width, height]);

  return terminalRef;
}
