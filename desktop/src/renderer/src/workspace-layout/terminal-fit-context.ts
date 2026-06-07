import type { FitAddon as XtermFitAddon } from "@xterm/addon-fit";
import type { Terminal as XtermTerminal } from "@xterm/xterm";

interface TerminalFitState {
  fitAddon: XtermFitAddon | null;
  focused: boolean;
  frozen: boolean;
  host: HTMLElement | null;
  terminal: XtermTerminal | null;
  visible: boolean;
}

interface XtermTerminalWithCore extends XtermTerminal {
  _core?: {
    _renderService?: {
      dimensions?: unknown;
    };
    viewport?: unknown;
  };
}

export interface TerminalFitContext {
  fitAddon: XtermFitAddon;
  host: HTMLElement;
  terminal: XtermTerminal;
}

export function terminalFitContext(state: TerminalFitState): TerminalFitContext | null {
  if (!state.visible) {
    return null;
  }
  if (!state.focused) {
    return null;
  }
  if (state.frozen) {
    return null;
  }
  if (!state.host || !state.fitAddon || !state.terminal) {
    return null;
  }
  return {
    fitAddon: state.fitAddon,
    host: state.host,
    terminal: state.terminal,
  };
}

export function terminalFitReady(terminal: XtermTerminal): boolean {
  const core = (terminal as XtermTerminalWithCore)._core;
  return core?._renderService?.dimensions !== undefined && core.viewport !== undefined;
}
