import type { FitAddon as XtermFitAddon } from "@xterm/addon-fit";
import type { SearchAddon as XtermSearchAddon } from "@xterm/addon-search";
import type { Terminal as XtermTerminal } from "@xterm/xterm";

import { terminalTheme, type TerminalDisplaySettings } from "./terminal-display-settings";

export interface TerminalDisposable {
  dispose(): void;
}

interface MountXtermTerminalOptions {
  isCurrent: () => boolean;
  onData: (data: string) => void;
  onOpenExternalUrl: (event: MouseEvent, uri: string) => void;
  onResize: (dimensions: { cols: number; rows: number }) => void;
  onSearchResults: (results: { resultCount: number; resultIndex: number }) => void;
  settings: TerminalDisplaySettings;
  terminalKeyHandler: (event: KeyboardEvent) => boolean;
  viewport: HTMLElement;
}

export interface MountedXtermTerminal {
  disposables: TerminalDisposable[];
  fitAddon: XtermFitAddon;
  searchAddon: XtermSearchAddon;
  terminal: XtermTerminal;
}

export async function mountXtermTerminal({
  isCurrent,
  onData,
  onOpenExternalUrl,
  onResize,
  onSearchResults,
  settings,
  terminalKeyHandler,
  viewport,
}: MountXtermTerminalOptions): Promise<MountedXtermTerminal | null> {
  const [{ Terminal }, { FitAddon }, { SearchAddon }, { WebLinksAddon }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
    import("@xterm/addon-search"),
    import("@xterm/addon-web-links"),
  ]);
  if (!isCurrent()) {
    return null;
  }
  const terminal = new Terminal({
    allowProposedApi: false,
    convertEol: true,
    cursorBlink: true,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    rows: 24,
    scrollback: settings.scrollback,
    theme: terminalTheme(settings.themeId),
  });
  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon({ highlightLimit: 1000 });
  const webLinksAddon = new WebLinksAddon(onOpenExternalUrl);
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(webLinksAddon);
  terminal.attachCustomKeyEventHandler(terminalKeyHandler);
  terminal.open(viewport);
  return {
    disposables: [
      terminal.onData(onData),
      terminal.onResize(onResize),
      searchAddon.onDidChangeResults(onSearchResults),
    ],
    fitAddon,
    searchAddon,
    terminal,
  };
}
