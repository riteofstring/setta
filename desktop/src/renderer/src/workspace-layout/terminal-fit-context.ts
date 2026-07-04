import type { FitAddon as XtermFitAddon } from "@xterm/addon-fit";
import type { Terminal as XtermTerminal } from "@xterm/xterm";

interface TerminalFitState {
  fitAddon: XtermFitAddon | null;
  frozen: boolean;
  terminal: XtermTerminal | null;
  viewport: HTMLElement | null;
  visible: boolean;
}

export interface TerminalFitContext {
  fitAddon: XtermFitAddon;
  terminal: XtermTerminal;
  viewport: HTMLElement;
}

export function terminalFitContext(state: TerminalFitState): TerminalFitContext | null {
  if (!state.visible) {
    return null;
  }
  if (state.frozen) {
    return null;
  }
  if (!state.viewport || !state.fitAddon || !state.terminal) {
    return null;
  }
  return {
    fitAddon: state.fitAddon,
    terminal: state.terminal,
    viewport: state.viewport,
  };
}
