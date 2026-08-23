import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeTerminal {
    public readonly buffer = { active: { baseY: 0 } };
    public readonly cols = 80;
    public readonly rows = 24;
    public element: HTMLElement | null = null;
    public readonly dispose = vi.fn();
    public readonly loadAddon = vi.fn();
    public readonly onData = vi.fn(() => ({ dispose: vi.fn() }));
    public readonly onRender = vi.fn((listener: () => void) => {
      this.renderListeners.push(listener);
      return {
        dispose: vi.fn(() => {
          const index = this.renderListeners.indexOf(listener);
          if (index !== -1) {
            this.renderListeners.splice(index, 1);
          }
        }),
      };
    });
    public readonly onResize = vi.fn(() => ({ dispose: vi.fn() }));
    public readonly write = vi.fn();
    private readonly renderListeners: Array<() => void> = [];

    public constructor(_options: unknown) {
      mocks.terminals.push(this);
    }

    public open(container: HTMLElement): void {
      this.element = document.createElement("div");
      container.append(this.element);
    }

    public render(): void {
      for (const listener of this.renderListeners) {
        listener();
      }
    }
  }

  class FakeFitAddon {
    public readonly fit = vi.fn();
  }

  type Listener = (event: Event | MessageEvent) => void;
  class FakeWebSocket {
    public static readonly CONNECTING = 0;
    public static readonly OPEN = 1;
    public static readonly CLOSING = 2;
    public static readonly CLOSED = 3;
    public binaryType = "blob";
    public readyState = FakeWebSocket.OPEN;
    public readonly close = vi.fn(() => {
      this.readyState = FakeWebSocket.CLOSED;
    });
    public readonly send = vi.fn();
    private readonly listeners = new Map<
      string,
      Array<{ listener: Listener; once: boolean }>
    >();

    public constructor(public readonly url: string) {
      mocks.sockets.push(this);
    }

    public addEventListener(
      type: string,
      listener: Listener,
      options?: AddEventListenerOptions,
    ): void {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push({ listener, once: options?.once === true });
      this.listeners.set(type, listeners);
    }

    public emit(type: string, event: Event | MessageEvent): void {
      const listeners = this.listeners.get(type) ?? [];
      for (const entry of listeners) {
        entry.listener(event);
      }
      this.listeners.set(
        type,
        listeners.filter((entry) => !entry.once),
      );
    }
  }

  return {
    FakeFitAddon,
    FakeTerminal,
    FakeWebSocket,
    getTerminalTicket: vi.fn(),
    sockets: [] as FakeWebSocket[],
    terminals: [] as FakeTerminal[],
  };
});

vi.mock("@xterm/xterm", () => ({ Terminal: mocks.FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: mocks.FakeFitAddon }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("../backend/client", () => ({
  getTerminalTicket: mocks.getTerminalTicket,
}));

import {
  disposeGeneratedPythonTerminal,
  mountGeneratedPythonTerminal,
} from "./generatedPythonTerminalClient";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.sockets.length = 0;
  mocks.terminals.length = 0;
  mocks.getTerminalTicket.mockResolvedValue({ ticket: "ticket-value" });
  vi.stubGlobal("WebSocket", mocks.FakeWebSocket);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Generated Python terminal client", () => {
  it("reuses one xterm and stream through a hide/show grace period, then trash disposes it", async () => {
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");
    const reportError = vi.fn();
    const releaseFirst = mountGeneratedPythonTerminal({
      container: firstContainer,
      onError: reportError,
      onScrollbackChange: vi.fn(),
      projectId: "project:terminal",
      sessionKey: "project:terminal:generated-python:1",
    });
    await flushMicrotasks();

    expect(mocks.terminals).toHaveLength(1);
    expect(mocks.getTerminalTicket).toHaveBeenCalledWith({
      projectId: "project:terminal",
    });
    expect(mocks.sockets).toHaveLength(1);
    const socket = mocks.sockets[0];
    if (socket === undefined) {
      throw new Error("Expected the terminal WebSocket.");
    }
    expect(socket.url).toContain(
      "/api/v2/project/terminal/stream?ticket=ticket-value",
    );

    releaseFirst();
    expect(socket.close).not.toHaveBeenCalled();

    const releaseSecond = mountGeneratedPythonTerminal({
      container: secondContainer,
      onError: reportError,
      onScrollbackChange: vi.fn(),
      projectId: "project:terminal",
      sessionKey: "project:terminal:generated-python:1",
    });
    await flushMicrotasks();

    expect(mocks.terminals).toHaveLength(1);
    expect(mocks.getTerminalTicket).toHaveBeenCalledTimes(1);
    expect(mocks.sockets).toHaveLength(1);

    socket.emit(
      "message",
      new MessageEvent("message", { data: '{"type":"ready"}' }),
    );
    expect(socket.send).toHaveBeenCalledWith(
      '{"columns":80,"rows":24,"type":"resize"}',
    );

    releaseSecond();
    disposeGeneratedPythonTerminal("project:terminal:generated-python:1");
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(mocks.terminals[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("reattaches after a transient stream reset instead of leaving a blank terminal", async () => {
    const container = document.createElement("div");
    const reportError = vi.fn();
    const release = mountGeneratedPythonTerminal({
      container,
      onError: reportError,
      onScrollbackChange: vi.fn(),
      projectId: "project:terminal",
      sessionKey: "project:terminal:generated-python:retry",
    });
    await flushMicrotasks();

    const firstSocket = mocks.sockets[0];
    if (firstSocket === undefined) {
      throw new Error("Expected the first terminal WebSocket.");
    }
    firstSocket.readyState = mocks.FakeWebSocket.CLOSED;
    firstSocket.emit("close", new Event("close"));

    await vi.advanceTimersByTimeAsync(100);
    await flushMicrotasks();

    expect(mocks.getTerminalTicket).toHaveBeenCalledTimes(2);
    expect(mocks.sockets).toHaveLength(2);
    const secondSocket = mocks.sockets[1];
    if (secondSocket === undefined) {
      throw new Error("Expected the replacement terminal WebSocket.");
    }
    secondSocket.emit(
      "message",
      new MessageEvent("message", { data: '{"type":"ready"}' }),
    );

    expect(reportError).not.toHaveBeenCalled();
    expect(secondSocket.send).toHaveBeenCalledWith(
      '{"columns":80,"rows":24,"type":"resize"}',
    );

    release();
    disposeGeneratedPythonTerminal("project:terminal:generated-python:retry");
  });

  it("hands wheel ownership to the terminal only after xterm renders scrollback", async () => {
    const container = document.createElement("div");
    const onScrollbackChange = vi.fn();
    const release = mountGeneratedPythonTerminal({
      container,
      onError: vi.fn(),
      onScrollbackChange,
      projectId: "project:terminal",
      sessionKey: "project:terminal:scrollback",
    });
    await flushMicrotasks();

    const terminal = mocks.terminals[0];
    if (terminal === undefined) {
      throw new Error("Expected an xterm instance.");
    }
    terminal.render();
    expect(onScrollbackChange).toHaveBeenLastCalledWith(false);

    terminal.buffer.active.baseY = 1;
    terminal.render();
    expect(onScrollbackChange).toHaveBeenLastCalledWith(true);

    release();
    disposeGeneratedPythonTerminal("project:terminal:scrollback");
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}
