import type { TerminalEvent, TerminalSessionResponse } from "@generated/backend";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TerminalSurfaceAdapter } from "./terminal-surface-adapter";
import { createFakeHost } from "./test-dom-fakes";
import type { NiriPane } from "./types";

vi.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal {
    buffer = { active: { length: 0 } };
    cols = 80;
    rows = 24;

    clear(): void {}
    dispose(): void {}
    focus(): void {}
    loadAddon(): void {}
    onData(): { dispose(): void } {
      return { dispose() {} };
    }
    onResize(): { dispose(): void } {
      return { dispose() {} };
    }
    open(): void {}
    scrollToBottom(): void {}
    write(_data?: unknown, callback?: () => void): void {
      this.buffer.active.length += 1;
      callback?.();
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit(): void {}
  },
}));

describe("terminal surface adapter", () => {
  let terminalListeners: Array<(event: TerminalEvent) => void>;
  let backendStatusListeners: Array<(status: { status: string; message: string }) => void>;

  beforeEach(() => {
    terminalListeners = [];
    backendStatusListeners = [];
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

    adapter.unmount();
    const secondHost = createFakeHost();
    adapter.mount(secondHost);
    await waitFor(() => api.terminal.attach.mock.calls.length === 2);

    expect(api.terminal.attach).toHaveBeenCalledTimes(2);
    expect(secondHost.dataset.terminalSessionId).toBe("terminal_existing");
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

  function installSettaAPI(overrides: {
    attach?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
  }) {
    const terminal = {
      attach:
        overrides.attach ?? vi.fn(async () => terminalResponse("terminal_existing", "running")),
      close: vi.fn(async (sessionId: string) => terminalResponse(sessionId, "closed")),
      create:
        overrides.create ?? vi.fn(async () => terminalResponse("terminal_created", "running")),
      input: vi.fn(async () => ({ acceptedBytes: 0 })),
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
      atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
      btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
      cancelAnimationFrame: vi.fn(),
      clearTimeout,
      requestAnimationFrame: vi.fn(),
      setTimeout,
      setta: {
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
    return { terminal };
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

async function waitFor(done: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!done()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
