export const terminalTheme = {
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

export function terminalCleanup(ws, terminal) {
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
}
