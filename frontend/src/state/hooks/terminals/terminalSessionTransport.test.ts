// @vitest-environment jsdom

import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { C } from "utils/c";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBootstrappedTerminalSession,
  type TerminalSession,
} from "./terminalSessionTransport";

const { TestFitAddon, TestTerminal } = vi.hoisted(() => {
  class TestFitAddon {
    proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));
  }

  type TerminalDataListener = (data: string) => void;
  type TerminalResizeListener = (size: { cols: number; rows: number }) => void;

  class TestTerminal {
    static instances: TestTerminal[] = [];

    element: HTMLDivElement | null = null;
    cols = 80;
    rows = 24;
    options = {
      disableStdin: false,
      scrollSensitivity: 1,
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
    readonly writes: string[] = [];
    readonly loadAddon = vi.fn();
    readonly open = vi.fn((container: HTMLElement) => {
      if (!this.element) {
        this.element = document.createElement("div");
      }
      container.replaceChildren(this.element);
    });
    readonly write = vi.fn((text: string) => {
      this.writes.push(text);
    });
    readonly resize = vi.fn((cols: number, rows: number) => {
      this.cols = cols;
      this.rows = rows;
    });
    readonly focus = vi.fn();
    readonly dispose = vi.fn();

    private readonly dataListeners = new Set<TerminalDataListener>();
    private readonly resizeListeners = new Set<TerminalResizeListener>();

    constructor(options: Partial<TestTerminal["options"]> = {}) {
      this.options = {
        ...this.options,
        ...options,
      };
      TestTerminal.instances.push(this);
    }

    onData(listener: TerminalDataListener) {
      this.dataListeners.add(listener);
      return {
        dispose: () => {
          this.dataListeners.delete(listener);
        },
      };
    }

    onResize(listener: TerminalResizeListener) {
      this.resizeListeners.add(listener);
      return {
        dispose: () => {
          this.resizeListeners.delete(listener);
        },
      };
    }

    emitData(data: string) {
      this.dataListeners.forEach((listener) => listener(data));
    }

    emitResize(size: { cols: number; rows: number }) {
      this.resizeListeners.forEach((listener) => listener(size));
    }
  }

  return { TestFitAddon, TestTerminal };
});

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: TestFitAddon,
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: TestTerminal,
}));

class TestWebSocket {
  static instances: TestWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly listeners = new Map<
    string,
    Set<(event?: MessageEvent | Event) => unknown>
  >();
  readonly send = vi.fn();
  readonly close = vi.fn(() => {
    this.readyState = TestWebSocket.CLOSED;
  });
  readyState = TestWebSocket.CONNECTING;

  constructor(public readonly url: string) {
    TestWebSocket.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event?: MessageEvent | Event) => unknown,
  ) {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  async emit(type: string, event?: MessageEvent | Event) {
    if (type === "open") {
      this.readyState = TestWebSocket.OPEN;
    }
    const listeners = Array.from(this.listeners.get(type) ?? []);
    for (const listener of listeners) {
      await listener(event);
    }
  }
}

describe("terminalSessionTransport", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
    });
    TestTerminal.instances = [];
    TestWebSocket.instances = [];
    vi.stubGlobal("WebSocket", TestWebSocket);
  });

  afterEach(() => {
    resetProjectStores();
    TestTerminal.instances = [];
    TestWebSocket.instances = [];
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("bootstraps the websocket address and forwards resize events through the queue callback", async () => {
    const queueResize = vi.fn();
    const flushResize = vi.fn();
    let currentSession: TerminalSession | undefined;

    currentSession = createBootstrappedTerminalSession({
      sessionKey: "project-1::share-1::section-1",
      projectConfigId: "project-1",
      sectionId: "section-1",
      shareSessionId: "share-1",
      isDeploymentMode: true,
      container: document.createElement("div"),
      getCurrentSession: () => currentSession,
      queueResize,
      flushResize,
    });

    const terminal = TestTerminal.instances[0];
    const socket = TestWebSocket.instances[0];

    expect(terminal.options.disableStdin).toBe(true);
    expect(socket.url).toContain("shareSessionId=share-1");

    terminal.emitResize({ cols: 90, rows: 30 });
    expect(queueResize).toHaveBeenCalledWith(
      "project-1::share-1::section-1",
      JSON.stringify({
        messageType: C.WS_TERMINAL_RESIZE,
        cols: 90,
        rows: 30,
      }),
    );

    await socket.emit("open", new Event("open"));
    expect(flushResize).toHaveBeenCalledWith("project-1::share-1::section-1");
  });

  it("waits for the ready sentinel before sending input and appends backend payloads", async () => {
    const queueResize = vi.fn();
    const flushResize = vi.fn();
    let currentSession: TerminalSession | undefined;

    currentSession = createBootstrappedTerminalSession({
      sessionKey: "project-1::::section-1",
      projectConfigId: "project-1",
      sectionId: "section-1",
      shareSessionId: null,
      isDeploymentMode: false,
      container: document.createElement("div"),
      getCurrentSession: () => currentSession,
      queueResize,
      flushResize,
    });

    const terminal = TestTerminal.instances[0];
    const socket = TestWebSocket.instances[0];

    terminal.emitData("before-ready");
    await socket.emit("open", new Event("open"));
    await socket.emit(
      "message",
      new MessageEvent("message", { data: C.SETTA_TERMINAL_READY }),
    );
    terminal.emitData("after-ready");
    useShareSession.setState({ isDeploymentMode: true });
    terminal.emitData("deployment-blocked");

    await socket.emit(
      "message",
      new MessageEvent("message", { data: "stdout" }),
    );
    await socket.emit(
      "message",
      new MessageEvent("message", { data: new Blob(["blobbed"]) }),
    );
    await Promise.resolve();

    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith("after-ready");
    expect(terminal.writes).toEqual(["stdout", "blobbed"]);
  });
});
