import type {
  TerminalEvent,
  TerminalProfileList,
  TerminalSessionResponse,
} from "@generated/backend";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TerminalSurfaceAdapter } from "./terminal-surface-adapter";
import { createFakeHost } from "./test-dom-fakes";
import type { NiriPane } from "./types";

const terminalMock = vi.hoisted(() => ({
  instances: [] as Array<{
    customKeyHandler: ((event: KeyboardEvent) => boolean) | null;
    dataListener: ((data: string) => void) | null;
    options: Record<string, unknown>;
    pasteCalls: string[];
    selection: string;
  }>,
  searchAddons: [] as Array<{
    findNext: ReturnType<typeof vi.fn>;
    findPrevious: ReturnType<typeof vi.fn>;
    resultListeners: Array<(event: { resultCount: number; resultIndex: number }) => void>;
  }>,
  webLinkHandlers: [] as Array<(event: MouseEvent, uri: string) => void>,
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal {
    buffer = { active: { length: 0 } };
    cols = 80;
    customKeyHandler: ((event: KeyboardEvent) => boolean) | null = null;
    dataListener: ((data: string) => void) | null = null;
    options: Record<string, unknown> = {};
    pasteCalls: string[] = [];
    rows = 24;
    selection = "";

    clear(): void {}
    clearSelection(): void {
      this.selection = "";
    }
    dispose(): void {}
    focus(): void {}
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
      this.customKeyHandler = handler;
    }
    getSelection(): string {
      return this.selection;
    }
    hasSelection(): boolean {
      return this.selection.length > 0;
    }
    loadAddon(): void {}
    onData(listener: (data: string) => void): { dispose(): void } {
      this.dataListener = listener;
      return { dispose() {} };
    }
    onResize(): { dispose(): void } {
      return { dispose() {} };
    }
    open(): void {}
    paste(data: string): void {
      this.pasteCalls.push(data);
      this.dataListener?.(data);
    }
    scrollToBottom(): void {}
    write(_data?: unknown, callback?: () => void): void {
      this.buffer.active.length += 1;
      callback?.();
    }

    constructor(options: Record<string, unknown>) {
      this.options = options;
      terminalMock.instances.push(this);
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit(): void {}
  },
}));

vi.mock("@xterm/addon-search", () => ({
  SearchAddon: class MockSearchAddon {
    findNext = vi.fn((term: string) => {
      this.emit(
        term.length > 0 ? { resultCount: 2, resultIndex: 0 } : { resultCount: 0, resultIndex: -1 },
      );
      return term.length > 0;
    });
    findPrevious = vi.fn((term: string) => {
      this.emit(
        term.length > 0 ? { resultCount: 2, resultIndex: 1 } : { resultCount: 0, resultIndex: -1 },
      );
      return term.length > 0;
    });
    resultListeners: Array<(event: { resultCount: number; resultIndex: number }) => void> = [];

    clearActiveDecoration(): void {}
    clearDecorations(): void {}
    dispose(): void {}
    onDidChangeResults(listener: (event: { resultCount: number; resultIndex: number }) => void): {
      dispose(): void;
    } {
      this.resultListeners.push(listener);
      return { dispose() {} };
    }

    constructor() {
      terminalMock.searchAddons.push(this);
    }

    private emit(event: { resultCount: number; resultIndex: number }): void {
      for (const listener of this.resultListeners) {
        listener(event);
      }
    }
  },
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class MockWebLinksAddon {
    dispose(): void {}

    constructor(handler: (event: MouseEvent, uri: string) => void) {
      terminalMock.webLinkHandlers.push(handler);
    }
  },
}));

describe("terminal surface adapter", () => {
  let terminalListeners: Array<(event: TerminalEvent) => void>;
  let backendStatusListeners: Array<(status: { status: string; message: string }) => void>;

  beforeEach(() => {
    terminalListeners = [];
    backendStatusListeners = [];
    terminalMock.instances.length = 0;
    terminalMock.searchAddons.length = 0;
    terminalMock.webLinkHandlers.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("attaches existing sessions and reattaches after remount", async () => {
    const api = installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
      create: vi.fn(async () => terminalResponse("terminal_created", "running")),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const firstHost = createFakeHost();

    adapter.mount(firstHost);
    await waitFor(() => api.terminal.attach.mock.calls.length === 1);

    expect(api.terminal.attach).toHaveBeenCalledTimes(1);
    expect(api.terminal.create).not.toHaveBeenCalled();
    expect(firstHost.dataset.terminalSessionId).toBe("terminal_existing");
    expect(firstHost.dataset.terminalStatus).toBe("running");
    expect(firstHost.style.getPropertyValue("--niri-terminal-background")).toBe("#09090b");

    adapter.unmount();
    const secondHost = createFakeHost();
    adapter.mount(secondHost);
    await waitFor(() => api.terminal.attach.mock.calls.length === 2);

    expect(api.terminal.attach).toHaveBeenCalledTimes(2);
    expect(secondHost.dataset.terminalSessionId).toBe("terminal_existing");
    expect(secondHost.style.getPropertyValue("--niri-terminal-background")).toBe("#09090b");
  });

  test("records backend truncation events as terminal stats", async () => {
    installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    await waitFor(() => host.dataset.terminalSessionId === "terminal_existing");
    emitTerminalEvent(
      terminalEvent("terminal.bufferTruncated", "terminal_existing", {
        droppedBytes: 128,
        droppedChunks: 3,
        message: "terminal output buffer truncated; dropped 3 chunks",
      }),
    );

    expect(adapter.getTerminalStats().droppedOutputChunks).toBe(3);
    expect(host.dataset.terminalStatus).toBe("running");
  });

  test("queues output that arrives before xterm finishes mounting", async () => {
    installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    emitTerminalEvent(
      terminalEvent("terminal.output", "terminal_existing", {
        byteCount: 5,
        dataBase64: Buffer.from("hello").toString("base64"),
      }),
    );

    expect(adapter.getTerminalStats().pendingOutputChunks).toBe(1);

    await waitFor(
      () =>
        host.dataset.terminalSessionId === "terminal_existing" &&
        adapter.getTerminalStats().pendingOutputChunks === 0,
    );

    expect(adapter.getTerminalStats().pendingOutputChunks).toBe(0);
    expect(adapter.getTerminalStats().scrollbackRows).toBeGreaterThan(0);
  });

  test("marks lost sessions on backend exit and starts fresh after backend recovery", async () => {
    const attach = vi
      .fn()
      .mockResolvedValueOnce(terminalResponse("terminal_existing", "running"))
      .mockRejectedValueOnce(new Error("terminal session not found"));
    const create = vi.fn(async () => terminalResponse("terminal_restarted", "running"));
    installSettaAPI({ attach, create });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    await waitFor(() => host.dataset.terminalSessionId === "terminal_existing");
    emitBackendStatus({ message: "Backend exited unexpectedly", status: "offline" });

    expect(host.dataset.terminalLost).toBe("true");
    expect(host.dataset.terminalStatus).toBe("lost");

    emitBackendStatus({ message: "Backend online", status: "online" });
    await waitFor(() => host.dataset.terminalSessionId === "terminal_restarted");

    expect(create).toHaveBeenCalledTimes(1);
    expect(host.dataset.terminalLost).toBe("false");
    expect(host.dataset.terminalSessionId).toBe("terminal_restarted");
  });

  test("keeps plain control keys available to terminal applications on non-macOS", async () => {
    installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
      platform: "linux",
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    await waitFor(() => terminalMock.instances.length === 1);

    const event = keyboardEvent({ ctrlKey: true, key: "c" });
    expect(terminalMock.instances[0]?.customKeyHandler?.(event)).toBe(true);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test("copies terminal selection with platform shortcut", async () => {
    const writeClipboardText = vi.fn(async () => undefined);
    installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
      platform: "darwin",
      writeClipboardText,
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    await waitFor(() => terminalMock.instances.length === 1);
    const terminal = terminalMock.instances[0];
    if (!terminal) {
      throw new Error("terminal was not mounted");
    }
    terminal.selection = "selected output";

    const event = keyboardEvent({ key: "c", metaKey: true });
    expect(terminal.customKeyHandler?.(event)).toBe(false);
    await waitFor(() => writeClipboardText.mock.calls.length === 1);

    expect(writeClipboardText).toHaveBeenCalledWith("selected output");
    expect(terminal.selection).toBe("");
  });

  test("warns before large paste and sends confirmed paste in bounded chunks", async () => {
    const pasted = "x".repeat(70 * 1024);
    const readClipboardText = vi.fn(async () => pasted);
    const api = installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
      platform: "darwin",
      readClipboardText,
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    await waitFor(() => host.dataset.terminalSessionId === "terminal_existing");
    const terminal = terminalMock.instances[0];
    if (!terminal) {
      throw new Error("terminal was not mounted");
    }

    const event = keyboardEvent({ key: "v", metaKey: true });
    expect(terminal.customKeyHandler?.(event)).toBe(false);
    await waitFor(() => readClipboardText.mock.calls.length === 1);

    expect(terminal.pasteCalls).toEqual([]);

    const confirm = host.querySelector(
      '[data-terminal-paste-confirm="true"]',
    ) as HTMLButtonElement | null;
    if (!confirm) {
      throw new Error("paste confirm button was not rendered");
    }
    confirm.dispatchEvent(fakeEvent("click"));
    await waitFor(() => api.terminal.input.mock.calls.length === 2);

    expect(terminal.pasteCalls).toEqual([pasted]);
    const inputCalls = api.terminal.input.mock.calls as unknown as Array<[{ dataBase64: string }]>;
    expect(
      inputCalls.reduce((byteCount, [request]) => {
        return byteCount + Buffer.from(request.dataBase64, "base64").byteLength;
      }, 0),
    ).toBe(Buffer.byteLength(pasted));
  });

  test("search shortcut drives the xterm search addon", async () => {
    installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
      platform: "darwin",
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    await waitFor(() => terminalMock.searchAddons.length === 1);
    const terminal = terminalMock.instances[0];
    const searchAddon = terminalMock.searchAddons[0];
    if (!terminal || !searchAddon) {
      throw new Error("terminal search addon was not mounted");
    }

    expect(terminal.customKeyHandler?.(keyboardEvent({ key: "f", metaKey: true }))).toBe(false);
    const input = host.querySelector(
      '[data-terminal-search-input="true"]',
    ) as HTMLInputElement | null;
    if (!input) {
      throw new Error("terminal search input was not rendered");
    }
    input.value = "needle";
    input.dispatchEvent(fakeEvent("input"));

    expect(searchAddon.findNext).toHaveBeenCalledWith(
      "needle",
      expect.objectContaining({ incremental: true }),
    );
  });

  test("opens terminal web links only through the safe external URL API", async () => {
    const openExternalUrl = vi.fn(async () => undefined);
    installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
      openExternalUrl,
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    await waitFor(() => terminalMock.webLinkHandlers.length === 1);

    const event = mouseEvent();
    terminalMock.webLinkHandlers[0]?.(event, "https://example.test/path");

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(openExternalUrl).toHaveBeenCalledWith("https://example.test/path");
  });

  function installSettaAPI(overrides: {
    attach?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    openExternalUrl?: ReturnType<typeof vi.fn>;
    platform?: string;
    readClipboardText?: ReturnType<typeof vi.fn>;
    writeClipboardText?: ReturnType<typeof vi.fn>;
  }) {
    const windowListeners = new Map<string, Set<EventListener>>();
    const localStorage = new MemoryStorage();
    const readClipboardText = overrides.readClipboardText ?? vi.fn(async () => "");
    const writeClipboardText = overrides.writeClipboardText ?? vi.fn(async () => undefined);
    const openExternalUrl = overrides.openExternalUrl ?? vi.fn(async () => undefined);
    const terminal = {
      attach:
        overrides.attach ?? vi.fn(async () => terminalResponse("terminal_existing", "running")),
      close: vi.fn(async (sessionId: string) => terminalResponse(sessionId, "closed")),
      create:
        overrides.create ?? vi.fn(async () => terminalResponse("terminal_created", "running")),
      input: vi.fn(async () => ({ acceptedBytes: 0 })),
      listProfiles: vi.fn(async () => terminalProfileList()),
      onEvent: vi.fn((listener: (event: TerminalEvent) => void) => {
        terminalListeners.push(listener);
        return () => {
          terminalListeners = terminalListeners.filter((candidate) => candidate !== listener);
        };
      }),
      resize: vi.fn(async (request: { sessionId: string }) =>
        terminalResponse(request.sessionId, "running"),
      ),
    };
    vi.stubGlobal("window", {
      CustomEvent,
      addEventListener: (type: string, listener: EventListener) => {
        const listeners = windowListeners.get(type) ?? new Set<EventListener>();
        listeners.add(listener);
        windowListeners.set(type, listeners);
      },
      atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
      btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
      cancelAnimationFrame: vi.fn(),
      clearTimeout,
      dispatchEvent: (event: Event) => {
        for (const listener of windowListeners.get(event.type) ?? []) {
          listener(event);
        }
        return true;
      },
      localStorage,
      navigator: {
        clipboard: {
          readText: readClipboardText,
          writeText: writeClipboardText,
        },
      },
      removeEventListener: (type: string, listener: EventListener) => {
        windowListeners.get(type)?.delete(listener);
      },
      requestAnimationFrame: vi.fn(),
      setTimeout,
      setta: {
        app: {
          openExternalUrl,
          platform: overrides.platform ?? "darwin",
        },
        backend: {
          onProcessStatus: (listener: (status: { status: string; message: string }) => void) => {
            backendStatusListeners.push(listener);
            return () => {
              backendStatusListeners = backendStatusListeners.filter(
                (candidate) => candidate !== listener,
              );
            };
          },
        },
        terminal,
      },
    });
    return { openExternalUrl, readClipboardText, terminal, writeClipboardText };
  }

  function emitTerminalEvent(event: TerminalEvent): void {
    for (const listener of terminalListeners) {
      listener(event);
    }
  }

  function emitBackendStatus(status: { status: string; message: string }): void {
    for (const listener of backendStatusListeners) {
      listener(status);
    }
  }
});

function terminalResponse(
  sessionId: string,
  status: TerminalSessionResponse["session"]["status"],
): TerminalSessionResponse {
  return {
    session: {
      cols: 80,
      createdAt: "2026-06-06T12:00:00Z",
      cwd: "/tmp/workspace",
      exitCode: 0,
      id: sessionId,
      message: "",
      paneId: "pane_terminal",
      profileId: "default",
      rows: 24,
      status,
      updatedAt: "2026-06-06T12:00:00Z",
      workspaceId: "workspace_api",
    },
  };
}

function terminalProfileList(): TerminalProfileList {
  return {
    defaultProfileId: "default",
    detectedShells: [],
    profiles: [
      {
        args: [],
        createdAt: "2026-06-06T12:00:00Z",
        cwd: "",
        cwdMode: "project",
        env: {},
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 13,
        id: "default",
        launchMode: "shell",
        name: "Default",
        safeAutoStart: true,
        scrollback: 1200,
        shellPath: "",
        themeId: "setta-dark",
        updatedAt: "2026-06-06T12:00:00Z",
      },
    ],
  };
}

function terminalEvent(
  type: TerminalEvent["type"],
  sessionId: string,
  payload: Partial<TerminalEvent["payload"]> = {},
): TerminalEvent {
  return {
    emittedAt: "2026-06-06T12:00:00Z",
    eventId: "terminal_stream_test:2",
    paneId: "pane_terminal",
    payload: {
      byteCount: 0,
      cols: 80,
      cwd: "/tmp/workspace",
      dataBase64: "",
      droppedBytes: 0,
      droppedChunks: 0,
      exitCode: 0,
      message: "",
      rows: 24,
      status: "running",
      ...payload,
    },
    schemaVersion: 1,
    sequence: 2,
    sessionId,
    streamId: "terminal_stream_test",
    type,
    workspaceId: "workspace_api",
  };
}

function fakePane(): NiriPane {
  return {
    columnId: "column_terminal",
    heat: 0,
    paneId: "pane_terminal",
    sequence: 1,
    subtitle: "terminal",
    surfaceId: "surface_terminal",
    surfaceKind: "terminal",
    title: "Terminal",
    tone: "green",
    weight: 1,
  };
}

function keyboardEvent({
  altKey = false,
  ctrlKey = false,
  key,
  metaKey = false,
  shiftKey = false,
}: {
  altKey?: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  return {
    altKey,
    ctrlKey,
    key,
    metaKey,
    preventDefault: vi.fn(),
    shiftKey,
    stopPropagation: vi.fn(),
    type: "keydown",
  } as unknown as KeyboardEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}

function mouseEvent(): MouseEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}

function fakeEvent(type: string): Event {
  return {
    defaultPrevented: false,
    type,
  } as Event;
}

async function waitFor(done: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!done()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
