// @vitest-environment jsdom

import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { C } from "utils/c";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireTerminalSession,
  clearTerminalSessions,
  getTerminalSessionKey,
  releaseTerminalSession,
  TERMINAL_RESIZE_THROTTLE_MS,
  TERMINAL_SESSION_CLOSE_DELAY_MS,
} from "./terminalSessions";

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

    constructor(_options: unknown) {
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

  removeEventListener(
    type: string,
    listener: (event?: MessageEvent | Event) => unknown,
  ) {
    this.listeners.get(type)?.delete(listener);
  }

  async emit(type: string, event?: MessageEvent | Event) {
    if (type === "open") {
      this.readyState = TestWebSocket.OPEN;
    }
    if (type === "close") {
      this.readyState = TestWebSocket.CLOSED;
    }
    const listeners = Array.from(this.listeners.get(type) ?? []);
    for (const listener of listeners) {
      await listener(event);
    }
  }
}

function createSessionInputs() {
  const sectionId = "terminal-section-1";
  const projectConfigId = "project-config-1";
  const shareSessionId = useShareSession.getState().shareSessionId;
  return {
    sectionId,
    projectConfigId,
    shareSessionId,
    sessionKey: getTerminalSessionKey({
      projectConfigId,
      sectionId,
      shareSessionId,
    }),
  };
}

describe("terminalSessions", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
    });
    TestTerminal.instances = [];
    TestWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", TestWebSocket);
    vi.stubGlobal("requestAnimationFrame", ((
      callback: FrameRequestCallback,
    ) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame);
  });

  afterEach(() => {
    clearTerminalSessions();
    resetProjectStores();
    TestTerminal.instances = [];
    TestWebSocket.instances = [];
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("reuses one terminal session across rapid release and reacquire cycles", () => {
    // Rapid remounts should not replay terminal history through a second socket.
    const firstContainer = document.createElement("div");
    const sessionInputs = createSessionInputs();
    const firstSession = acquireTerminalSession({
      ...sessionInputs,
      isDeploymentMode: false,
      container: firstContainer,
    });

    releaseTerminalSession(sessionInputs.sessionKey);

    const secondContainer = document.createElement("div");
    const secondSession = acquireTerminalSession({
      ...sessionInputs,
      isDeploymentMode: false,
      container: secondContainer,
    });

    vi.advanceTimersByTime(TERMINAL_SESSION_CLOSE_DELAY_MS + 1);

    expect(secondSession).toBe(firstSession);
    expect(TestTerminal.instances).toHaveLength(1);
    expect(TestWebSocket.instances).toHaveLength(1);
    expect(secondContainer.firstElementChild).toBe(
      TestTerminal.instances[0].element,
    );
    expect(TestWebSocket.instances[0].close).not.toHaveBeenCalled();
  });

  it("blocks stdin until the backend marks the terminal session as ready", async () => {
    // Input should only flow after the ready sentinel and should stop in deployment mode.
    const container = document.createElement("div");
    const sessionInputs = createSessionInputs();
    acquireTerminalSession({
      ...sessionInputs,
      isDeploymentMode: false,
      container,
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

    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith("after-ready");
  });

  it("coalesces terminal resize messages until the socket can send them", async () => {
    // Resize traffic should keep only the latest dimensions while the socket is connecting.
    const container = document.createElement("div");
    const sessionInputs = createSessionInputs();
    acquireTerminalSession({
      ...sessionInputs,
      isDeploymentMode: false,
      container,
    });

    const terminal = TestTerminal.instances[0];
    const socket = TestWebSocket.instances[0];

    terminal.emitResize({ cols: 81, rows: 25 });
    terminal.emitResize({ cols: 100, rows: 40 });
    expect(socket.send).not.toHaveBeenCalled();

    await socket.emit("open", new Event("open"));
    terminal.emitResize({ cols: 101, rows: 41 });
    terminal.emitResize({ cols: 102, rows: 42 });
    vi.advanceTimersByTime(TERMINAL_RESIZE_THROTTLE_MS + 1);

    expect(socket.send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(socket.send.mock.calls[0][0]))).toMatchObject({
      messageType: C.WS_TERMINAL_RESIZE,
      cols: 100,
      rows: 40,
    });
    expect(JSON.parse(String(socket.send.mock.calls[1][0]))).toMatchObject({
      messageType: C.WS_TERMINAL_RESIZE,
      cols: 102,
      rows: 42,
    });
  });
});
