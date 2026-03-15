// @vitest-environment jsdom

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitTerminal } from "./terminalFit";

const { TestFitAddon, TestTerminal } = vi.hoisted(() => {
  class TestFitAddon {
    readonly proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));
  }

  class TestTerminal {
    element: HTMLDivElement | null = null;
    cols = 80;
    rows = 24;
    options = {
      scrollback: 1000,
    };
    buffer = {
      active: {
        baseY: 0,
        cursorY: 0,
        length: 0,
        getLine: () => null,
      },
    };
    readonly resize = vi.fn((cols: number, rows: number) => {
      this.cols = cols;
      this.rows = rows;
    });

    constructor(_options: unknown) {}
  }

  return { TestFitAddon, TestTerminal };
});

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: TestFitAddon,
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: TestTerminal,
}));

function setElementDimension(
  element: HTMLElement,
  key: "clientWidth" | "clientHeight" | "offsetWidth",
  value: number,
) {
  Object.defineProperty(element, key, {
    configurable: true,
    value,
  });
}

function attachTerminalElement(terminal: Terminal, container: HTMLDivElement) {
  const terminalElement = document.createElement("div");
  terminalElement.style.paddingTop = "4px";
  terminalElement.style.paddingBottom = "4px";
  terminalElement.style.paddingLeft = "6px";
  terminalElement.style.paddingRight = "6px";

  const viewport = document.createElement("div");
  viewport.className = "xterm-viewport";
  setElementDimension(viewport, "offsetWidth", 100);
  setElementDimension(viewport, "clientWidth", 90);
  terminalElement.append(viewport);
  container.append(terminalElement);

  Object.defineProperty(terminal, "element", {
    configurable: true,
    value: terminalElement,
    writable: true,
  });
}

describe("terminalFit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips fitting while the terminal container is effectively hidden", () => {
    // Hidden terminals should wait for a real size instead of committing a 0x0 fit.
    const container = document.createElement("div");
    setElementDimension(container, "clientWidth", 12);
    setElementDimension(container, "clientHeight", 100);
    const fitAddon = new FitAddon();
    const terminal = new Terminal({});

    fitTerminal({
      container,
      fitAddon,
      terminal,
    });

    expect(fitAddon.proposeDimensions).not.toHaveBeenCalled();
    expect(terminal.resize).not.toHaveBeenCalled();
  });

  it("falls back to DOM-based dimensions after a fit-addon propose failure", () => {
    // Once addon-fit throws, the fallback path should keep resizing without retrying proposeDimensions.
    const container = document.createElement("div");
    setElementDimension(container, "clientWidth", 200);
    setElementDimension(container, "clientHeight", 100);
    const fitAddon = new FitAddon();
    fitAddon.proposeDimensions.mockImplementation(() => {
      throw new Error("addon mismatch");
    });

    const terminal = new Terminal({});
    terminal.cols = 10;
    terminal.rows = 5;
    attachTerminalElement(terminal, container);
    const clear = vi.fn();
    Object.defineProperty(terminal, "_core", {
      configurable: true,
      value: {
        _renderService: {
          clear,
          dimensions: {
            css: {
              cell: {
                width: 10,
                height: 20,
              },
            },
          },
        },
      },
    });

    fitTerminal({
      container,
      fitAddon,
      terminal,
    });
    fitTerminal({
      container,
      fitAddon,
      terminal,
    });

    expect(fitAddon.proposeDimensions).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(terminal.resize).toHaveBeenCalledTimes(1);
    expect(terminal.resize).toHaveBeenCalledWith(17, 4);
  });
});
