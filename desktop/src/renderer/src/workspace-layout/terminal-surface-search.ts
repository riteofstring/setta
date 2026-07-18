import type { SearchAddon as XtermSearchAddon } from "@xterm/addon-search";
import type { Terminal as XtermTerminal } from "@xterm/xterm";

import { terminalSearchOptions } from "./terminal-ergonomics";
import type { TerminalSearchElements } from "./terminal-surface-dom";

export class TerminalSearchController {
  private elements: TerminalSearchElements | null = null;
  private resultCount = 0;
  private resultIndex = -1;
  private searchAddon: XtermSearchAddon | null = null;
  private terminal: XtermTerminal | null = null;

  setElements(elements: TerminalSearchElements | null): void {
    this.elements = elements;
    this.resultCount = 0;
    this.resultIndex = -1;
  }

  setSearchAddon(searchAddon: XtermSearchAddon | null): void {
    this.searchAddon = searchAddon;
  }

  setTerminal(terminal: XtermTerminal | null): void {
    this.terminal = terminal;
  }

  handleResults(results: { resultCount: number; resultIndex: number }): void {
    this.resultIndex = results.resultIndex;
    this.resultCount = results.resultCount;
    this.renderStatus();
  }

  open(): void {
    this.elements?.root.removeAttribute("hidden");
    this.elements?.input.focus?.();
    this.elements?.input.select?.();
    this.findNext(true);
  }

  close(): void {
    this.elements?.root.setAttribute("hidden", "true");
    this.searchAddon?.clearDecorations();
    this.searchAddon?.clearActiveDecoration();
    this.resultCount = 0;
    this.resultIndex = -1;
    this.renderStatus();
    this.terminal?.focus();
  }

  findNext(incremental: boolean): void {
    const query = this.query();
    if (query.length === 0) {
      this.clearEmptySearch();
      return;
    }
    const found = this.searchAddon?.findNext(query, terminalSearchOptions(incremental)) ?? false;
    this.renderMissingResult(found);
  }

  findPrevious(): void {
    const query = this.query();
    if (query.length === 0) {
      return;
    }
    const found = this.searchAddon?.findPrevious(query, terminalSearchOptions(false)) ?? false;
    this.renderMissingResult(found);
  }

  handleKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (event.shiftKey) {
      this.findPrevious();
      return;
    }
    this.findNext(false);
  }

  private clearEmptySearch(): void {
    this.searchAddon?.clearDecorations();
    this.resultCount = 0;
    this.resultIndex = -1;
    this.renderStatus();
  }

  private renderMissingResult(found: boolean): void {
    if (found) {
      return;
    }
    this.resultCount = 0;
    this.resultIndex = -1;
    this.renderStatus();
  }

  private renderStatus(): void {
    const elements = this.elements;
    if (!elements) {
      return;
    }
    if (this.resultCount <= 0) {
      elements.status.textContent = this.query().length === 0 ? "" : "No matches";
      return;
    }
    elements.status.textContent =
      this.resultIndex < 0
        ? `${this.resultCount} matches`
        : `${this.resultIndex + 1}/${this.resultCount}`;
  }

  private query(): string {
    return this.elements?.input.value.trim() ?? "";
  }
}
