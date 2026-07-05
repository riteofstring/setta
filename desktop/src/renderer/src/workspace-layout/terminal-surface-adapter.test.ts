import type {
  TerminalEvent,
  TerminalProfileList,
  TerminalSessionResponse,
} from "@generated/backend";
import type { RuntimeConnectionStatus, RuntimeRegistrySnapshot } from "@shared/types";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TerminalSurfaceAdapter } from "./terminal-surface-adapter";
import { dispatchTerminalProfilesChanged } from "./terminal-profiles";
import { createFakeHost } from "./test-dom-fakes";
import { useAppearanceStore } from "../stores/appearance-store";
import { useRuntimeStore } from "../stores/runtime-store";
import type { WorkspacePane } from "./types";

const terminalMock = vi.hoisted(() => ({
  fitDimensions: null as { cols: number; rows: number } | null,
  fitAddons: [] as Array<{
    fit: ReturnType<typeof vi.fn>;
  }>,
  instances: [] as Array<{
    _core: Record<string, unknown>;
    cols: number;
    customKeyHandler: ((event: KeyboardEvent) => boolean) | null;
    dataListener: ((data: string) => void) | null;
    options: Record<string, unknown>;
    pasteCalls: string[];
    resetCalls: number;
    rows: number;
    selection: string;
    text: string;
    writeCalls: unknown[];
  }>,
  operations: [] as string[],
  searchAddons: [] as Array<{
    findNext: ReturnType<typeof vi.fn>;
    findPrevious: ReturnType<typeof vi.fn>;
    resultListeners: Array<(event: { resultCount: number; resultIndex: number }) => void>;
  }>,
  readyCore: () => ({ _renderService: { dimensions: {} }, viewport: {} }),
  renderReady: true,
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
    resetCalls = 0;
    rows = 24;
    selection = "";
    text = "";
    writeCalls: unknown[] = [];
    _core = terminalMock.renderReady ? terminalMock.readyCore() : {};

    clear(): void {
      this.text = "";
      this.buffer.active.length = 0;
    }
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
    loadAddon(addon: unknown): void {
      if (
        addon &&
        typeof addon === "object" &&
        "__setTerminalForTest" in addon &&
        typeof addon.__setTerminalForTest === "function"
      ) {
        addon.__setTerminalForTest(this);
      }
    }
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
    reset(): void {
      this.resetCalls += 1;
      this.text = "";
      this.buffer.active.length = 0;
    }
    scrollToBottom(): void {}
    write(data?: unknown, callback?: () => void): void {
      this.writeCalls.push(data);
      if (data instanceof Uint8Array) {
        this.text += Buffer.from(data).toString("utf8");
      } else if (typeof data === "string") {
        this.text += data;
      }
      terminalMock.operations.push("write");
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
    terminal: { cols: number; rows: number } | null = null;
    fit = vi.fn(() => {
      if (this.terminal && terminalMock.fitDimensions) {
        this.terminal.cols = terminalMock.fitDimensions.cols;
        this.terminal.rows = terminalMock.fitDimensions.rows;
      }
    });

    __setTerminalForTest(terminal: { cols: number; rows: number }): void {
      this.terminal = terminal;
    }

    constructor() {
      terminalMock.fitAddons.push(this);
    }
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
    terminalMock.fitDimensions = null;
    terminalMock.fitAddons.length = 0;
    terminalMock.instances.length = 0;
    terminalMock.operations.length = 0;
    terminalMock.renderReady = true;
    terminalMock.searchAddons.length = 0;
    terminalMock.webLinkHandlers.length = 0;
    useAppearanceStore.setState({
      defaultPresetId: null,
      draft: null,
      error: null,
      presets: [],
      settings: null,
      status: "idle",
    });
    useRuntimeStore.setState(useRuntimeStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("attaches existing sessions when visible and reattaches after remount", async () => {
    const api = installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
      create: vi.fn(async () => terminalResponse("terminal_created", "running")),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const firstHost = createFakeHost();

    adapter.mount(firstHost);
    await waitFor(() => terminalMock.instances.length === 1);

    expect(api.terminal.attach).not.toHaveBeenCalled();

    adapter.setVisible(true);
    await waitFor(() => firstHost.dataset.terminalSessionId === "terminal_existing");

    expect(api.terminal.attach).toHaveBeenCalledTimes(1);
    expect(api.terminal.create).not.toHaveBeenCalled();
    expect(firstHost.dataset.terminalSessionId).toBe("terminal_existing");
    expect(firstHost.dataset.terminalStatus).toBe("running");
    expect(firstHost.dataset.surfaceFocused).toBe("false");
    expect(firstHost.style.getPropertyValue("--workspace-terminal-background")).toBe("#09090b");

    adapter.unmount();
    const secondHost = createFakeHost();
    adapter.mount(secondHost);
    adapter.setVisible(true);
    await waitFor(
      () =>
        secondHost.dataset.terminalSessionId === "terminal_existing" &&
        api.terminal.attach.mock.calls.length === 2,
    );

    expect(api.terminal.attach).toHaveBeenCalledTimes(2);
    expect(secondHost.dataset.terminalSessionId).toBe("terminal_existing");
    expect(secondHost.style.getPropertyValue("--workspace-terminal-background")).toBe("#09090b");
  });

  test("creates a safe visible terminal without waiting for focus", async () => {
    const api = installSettaAPI({
      attach: vi.fn(async () => {
        throw new Error("terminal session not found");
      }),
      create: vi.fn(async () => terminalResponse("terminal_created", "running")),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    await waitFor(() => terminalMock.instances.length === 1);

    expect(api.terminal.attach).not.toHaveBeenCalled();
    expect(api.terminal.create).not.toHaveBeenCalled();

    adapter.setVisible(true);
    await waitFor(() => host.dataset.terminalSessionId === "terminal_created");

    expect(api.terminal.attach).toHaveBeenCalledTimes(1);
    expect(api.terminal.create).toHaveBeenCalledTimes(1);
    expect(host.dataset.surfaceFocused).toBe("false");
  });

  test("retries visible auto-start when late profile data marks the pane safe", async () => {
    const api = installSettaAPI({
      attach: vi.fn(async () => {
        throw new Error("terminal session not found");
      }),
      create: vi.fn(async () => terminalResponse("terminal_created", "running")),
      profiles: terminalProfileList({
        defaultProfileId: "custom",
        safeAutoStart: false,
      }),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    adapter.setVisible(true);
    await waitFor(() => host.dataset.terminalStatus === "waiting");

    expect(api.terminal.create).not.toHaveBeenCalled();

    dispatchTerminalProfilesChanged(terminalProfileList());
    await waitFor(() => host.dataset.terminalSessionId === "terminal_created");

    expect(api.terminal.create).toHaveBeenCalledTimes(1);
    expect(host.dataset.terminalStatus).toBe("running");
  });

  test("auto-starts after runtime switch when new runtime profiles load after the pane is visible", async () => {
    useRuntimeStore.setState({
      snapshot: runtimeSnapshot("local-runtime", "connected"),
      status: "ready",
    });
    let profiles: TerminalProfileList | Promise<TerminalProfileList> = terminalProfileList({
      defaultProfileId: "custom",
      safeAutoStart: false,
    });
    const switchedProfiles = deferred<TerminalProfileList>();
    const api = installSettaAPI({
      attach: vi.fn(async () => {
        throw new Error("terminal session not found");
      }),
      create: vi.fn(async () => terminalResponse("terminal_created", "running")),
      listProfiles: vi.fn(async () => profiles),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    adapter.setVisible(true);
    await waitFor(() => host.dataset.terminalStatus === "waiting");

    profiles = switchedProfiles.promise;
    useRuntimeStore.setState({
      snapshot: runtimeSnapshot("remote-runtime", "connected"),
      status: "ready",
    });
    await waitFor(() => api.terminal.listProfiles.mock.calls.length >= 2);

    expect(api.terminal.create).not.toHaveBeenCalled();

    switchedProfiles.resolve(terminalProfileList());
    await waitFor(() => host.dataset.terminalSessionId === "terminal_created");

    expect(api.terminal.create).toHaveBeenCalledTimes(1);
    expect(host.dataset.terminalProfileId).toBe("default");
  });

  test("reattaches the existing local session after switching back without stale remote create", async () => {
    useRuntimeStore.setState({
      snapshot: runtimeSnapshot("local-runtime", "connected"),
      status: "ready",
    });
    const staleRemoteAttach = deferred<TerminalSessionResponse>();
    const attach = vi.fn(async () => {
      const activeRuntimeId = useRuntimeStore.getState().snapshot?.activeRuntimeId;
      if (activeRuntimeId === "remote-runtime") {
        return staleRemoteAttach.promise;
      }
      return terminalResponse("terminal_local_existing", "running");
    });
    const create = vi.fn(async () => terminalResponse("terminal_created", "running"));
    const api = installSettaAPI({ attach, create });
    const firstAdapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const firstHost = createFakeHost();

    firstAdapter.mount(firstHost);
    firstAdapter.setVisible(true);
    await waitFor(() => firstHost.dataset.terminalSessionId === "terminal_local_existing");
    firstAdapter.destroy();

    useRuntimeStore.setState({
      snapshot: runtimeSnapshot("remote-runtime", "connected"),
      status: "ready",
    });
    const switchingAdapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const switchingHost = createFakeHost();

    switchingAdapter.mount(switchingHost);
    switchingAdapter.setVisible(true);
    await waitFor(() => api.terminal.attach.mock.calls.length === 2);

    useRuntimeStore.setState({
      snapshot: runtimeSnapshot("local-runtime", "connected"),
      status: "ready",
    });
    await waitFor(
      () =>
        api.terminal.attach.mock.calls.length === 3 &&
        switchingHost.dataset.terminalSessionId === "terminal_local_existing",
    );

    staleRemoteAttach.reject(new Error("terminal session not found"));
    await delay(20);

    expect(api.terminal.create).not.toHaveBeenCalled();
    expect(switchingHost.dataset.terminalSessionId).toBe("terminal_local_existing");
  });

  test("keeps visible auto-start discovery in flight across remount before creating", async () => {
    const attachDiscovery = deferred<TerminalSessionResponse>();
    const api = installSettaAPI({
      attach: vi
        .fn()
        .mockReturnValueOnce(attachDiscovery.promise)
        .mockRejectedValueOnce(new Error("terminal session not found")),
      create: vi.fn(async () => terminalResponse("terminal_created", "running")),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const firstHost = createFakeHost();

    adapter.mount(firstHost);
    adapter.setVisible(true);
    await waitFor(() => api.terminal.attach.mock.calls.length === 1);

    adapter.unmount();
    const secondHost = createFakeHost();
    adapter.mount(secondHost);
    adapter.setVisible(true);
    await waitFor(() => terminalMock.instances.length === 2);

    expect(api.terminal.attach).toHaveBeenCalledTimes(1);
    expect(api.terminal.create).not.toHaveBeenCalled();

    attachDiscovery.resolve(terminalResponse("terminal_existing", "running"));
    await waitFor(() => secondHost.dataset.terminalSessionId === "terminal_existing");

    expect(api.terminal.attach).toHaveBeenCalledTimes(1);
    expect(api.terminal.create).not.toHaveBeenCalled();
  });

  test("does not start a visible terminal while runtime policy keeps it frozen", async () => {
    const api = installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    adapter.freeze("runtime-policy");
    adapter.setVisible(true);
    await waitFor(() => terminalMock.instances.length === 1);

    expect(api.terminal.attach).not.toHaveBeenCalled();
    expect(host.dataset.terminalSessionId).toBe("");

    adapter.resume("visible");
    await waitFor(() => host.dataset.terminalSessionId === "terminal_existing");

    expect(api.terminal.attach).toHaveBeenCalledTimes(1);
  });

  test("keeps unsafe visible profiles behind explicit start", async () => {
    const profiles = terminalProfileList({
      defaultProfileId: "custom",
      safeAutoStart: false,
    });
    const api = installSettaAPI({
      attach: vi.fn(async () => {
        throw new Error("terminal session not found");
      }),
      create: vi.fn(async () => terminalResponse("terminal_created", "running")),
      profiles,
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    adapter.setVisible(true);
    await waitFor(() => host.dataset.terminalStatus === "waiting");

    expect(api.terminal.attach).toHaveBeenCalledTimes(1);
    expect(api.terminal.create).not.toHaveBeenCalled();
    expect(host.dataset.terminalStatus).toBe("waiting");
  });

  test("fits initial visible terminal without focus, resize, or private xterm dimensions", async () => {
    terminalMock.renderReady = false;
    terminalMock.fitDimensions = { cols: 100, rows: 48 };
    const api = installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    adapter.setVisible(true);
    await waitFor(() => (terminalMock.fitAddons[0]?.fit.mock.calls.length ?? 0) > 0);

    expect(terminalMock.instances[0]?.rows).toBe(48);
    expect(host.dataset.terminalSessionId).toBe("terminal_existing");
    await waitFor(() => api.terminal.resize.mock.calls.length === 1);
    expect(api.terminal.resize).toHaveBeenCalledWith({
      cols: 100,
      rows: 48,
      sessionId: "terminal_existing",
    });
  });

  test("updates pane chrome title from attached and pushed terminal cwd", async () => {
    installSettaAPI({
      attach: vi.fn(async () =>
        terminalResponse("terminal_existing", "running", { cwd: "/home/ubuntu/dev" }),
      ),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    adapter.setVisible(true);
    await waitFor(() => host.dataset.terminalSessionId === "terminal_existing");

    expect(host.dataset.workspacePaneChromeTitle).toBe("/home/ubuntu/dev");
    expect(host.dataset.workspacePaneChromeTruncation).toBe("start");
    expect(host.dataset.terminalStatusText).toBe("/home/ubuntu/dev");

    emitTerminalEvent(
      terminalEvent("terminal.started", "terminal_existing", {
        cwd: "/srv/current",
        status: "running",
      }),
    );

    expect(host.dataset.workspacePaneChromeTitle).toBe("/srv/current");
    expect(host.dataset.terminalStatusText).toBe("/srv/current");
  });

  test("records backend truncation events as terminal stats", async () => {
    installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    adapter.setVisible(true);
    adapter.setFocused(true);
    await waitFor(() => host.dataset.terminalSessionId === "terminal_existing");
    emitTerminalEvent(
      terminalEvent("terminal.bufferTruncated", "terminal_existing", {
        droppedBytes: 128,
        droppedChunks: 3,
        message: "terminal replay history truncated; 3 output chunks unavailable",
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
    adapter.setVisible(true);
    adapter.setFocused(true);
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

  test("redrains attach replay idempotently on consecutive attaches", async () => {
    const firstAttach = deferred<TerminalSessionResponse>();
    const secondAttach = deferred<TerminalSessionResponse>();
    const api = installSettaAPI({
      attach: vi
        .fn()
        .mockReturnValueOnce(firstAttach.promise)
        .mockReturnValueOnce(secondAttach.promise),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();
    const replay = "$ ls\nalpha\nbeta\n";

    adapter.mount(host);
    adapter.setVisible(true);
    await waitFor(() => api.terminal.attach.mock.calls.length === 1);
    await waitFor(() => terminalMock.instances.length === 1);
    emitTerminalOutput("terminal_existing", replay);
    firstAttach.resolve(terminalResponse("terminal_existing", "running"));
    const terminal = terminalMock.instances[0];
    await waitFor(() => terminal?.text === replay);

    expect(terminal?.resetCalls).toBe(1);

    forceReattach(adapter);
    await waitFor(() => api.terminal.attach.mock.calls.length === 2);
    emitTerminalOutput("terminal_existing", replay);
    secondAttach.resolve(terminalResponse("terminal_existing", "running"));
    await waitFor(() => terminal?.resetCalls === 2 && terminal.text === replay);

    expect(terminal?.text).toBe(replay);
  });

  test("keeps live output queued during attach redrain exactly once", async () => {
    const firstAttach = deferred<TerminalSessionResponse>();
    const secondAttach = deferred<TerminalSessionResponse>();
    const api = installSettaAPI({
      attach: vi
        .fn()
        .mockReturnValueOnce(firstAttach.promise)
        .mockReturnValueOnce(secondAttach.promise),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();
    const replay = "$ pwd\n/tmp/workspace\n";
    const liveOutput = "$ echo live\nlive\n";

    adapter.mount(host);
    adapter.setVisible(true);
    await waitFor(() => api.terminal.attach.mock.calls.length === 1);
    await waitFor(() => terminalMock.instances.length === 1);
    emitTerminalOutput("terminal_existing", replay);
    firstAttach.resolve(terminalResponse("terminal_existing", "running"));
    const terminal = terminalMock.instances[0];
    await waitFor(() => terminal?.text === replay);

    forceReattach(adapter);
    await waitFor(() => api.terminal.attach.mock.calls.length === 2);
    emitTerminalOutput("terminal_existing", replay);
    emitTerminalOutput("terminal_existing", liveOutput);
    secondAttach.resolve(terminalResponse("terminal_existing", "running"));
    await waitFor(() => terminal?.text === replay + liveOutput);

    expect(terminal?.text).toBe(replay + liveOutput);
    expect(terminal?.resetCalls).toBe(2);
  });

  test("resizes an attached mismatched session before writing replay output", async () => {
    terminalMock.fitDimensions = { cols: 100, rows: 48 };
    const attach = deferred<TerminalSessionResponse>();
    const resize = deferred<TerminalSessionResponse>();
    const api = installSettaAPI({
      attach: vi.fn(() => attach.promise),
      resize: vi.fn((request: { cols: number; rows: number; sessionId: string }) => {
        terminalMock.operations.push("resize");
        return resize.promise.then(() =>
          terminalResponse(request.sessionId, "running", {
            cols: request.cols,
            rows: request.rows,
          }),
        );
      }),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    adapter.setVisible(true);
    await waitFor(() => terminalMock.instances.length === 1);
    emitTerminalEvent(
      terminalEvent("terminal.output", "terminal_existing", {
        byteCount: 7,
        dataBase64: Buffer.from("prompt\n").toString("base64"),
      }),
    );

    expect(terminalMock.instances[0]?.writeCalls).toEqual([]);
    expect(adapter.getTerminalStats().pendingOutputChunks).toBe(1);

    attach.resolve(
      terminalResponse("terminal_existing", "running", {
        cols: 80,
        rows: 24,
      }),
    );
    await waitFor(() => api.terminal.resize.mock.calls.length === 1);

    expect(api.terminal.resize).toHaveBeenCalledWith({
      cols: 100,
      rows: 48,
      sessionId: "terminal_existing",
    });
    expect(terminalMock.instances[0]?.writeCalls).toEqual([]);

    resize.resolve(terminalResponse("terminal_existing", "running", { cols: 100, rows: 48 }));
    await waitFor(() => (terminalMock.instances[0]?.writeCalls.length ?? 0) === 1);

    expect(terminalMock.operations).toEqual(["resize", "write"]);
    expect(adapter.getTerminalStats().pendingOutputChunks).toBe(0);
  });

  test("resizes from initial fit before writing replay when private xterm dimensions are absent", async () => {
    terminalMock.renderReady = false;
    terminalMock.fitDimensions = { cols: 120, rows: 54 };
    const attach = deferred<TerminalSessionResponse>();
    const resize = deferred<TerminalSessionResponse>();
    const api = installSettaAPI({
      attach: vi.fn(() => attach.promise),
      resize: vi.fn((request: { cols: number; rows: number; sessionId: string }) => {
        terminalMock.operations.push("resize");
        return resize.promise.then(() =>
          terminalResponse(request.sessionId, "running", {
            cols: request.cols,
            rows: request.rows,
          }),
        );
      }),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    adapter.setVisible(true);
    await waitFor(() => terminalMock.instances.length === 1);
    emitTerminalEvent(
      terminalEvent("terminal.output", "terminal_existing", {
        byteCount: 7,
        dataBase64: Buffer.from("prompt\n").toString("base64"),
      }),
    );

    attach.resolve(terminalResponse("terminal_existing", "running", { cols: 80, rows: 24 }));
    await waitFor(() => host.dataset.terminalSessionId === "terminal_existing");
    await waitFor(() => api.terminal.resize.mock.calls.length === 1);

    expect(api.terminal.resize).toHaveBeenCalledWith({
      cols: 120,
      rows: 54,
      sessionId: "terminal_existing",
    });
    const terminal = terminalMock.instances[0];
    if (!terminal) {
      throw new Error("terminal instance was not created");
    }
    expect(terminal.writeCalls).toEqual([]);

    resize.resolve(terminalResponse("terminal_existing", "running", { cols: 120, rows: 54 }));
    await waitFor(() => terminal.writeCalls.length === 1);

    expect(terminalMock.operations).toEqual(["resize", "write"]);
    expect(adapter.getTerminalStats().pendingOutputChunks).toBe(0);
  });

  test("does not resize a session that closes while a fit is queued", async () => {
    const api = installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    adapter.setVisible(true);
    await waitFor(() => host.dataset.terminalSessionId === "terminal_existing");
    await delay(20);

    expect(api.terminal.resize).not.toHaveBeenCalled();

    terminalMock.fitDimensions = { cols: 100, rows: 48 };
    adapter.setViewport({ height: 480, width: 720, x: 0, y: 0 }, "resize");
    emitTerminalEvent(
      terminalEvent("terminal.closed", "terminal_existing", {
        status: "closed",
      }),
    );
    await delay(120);

    expect(host.dataset.terminalStatus).toBe("closed");
    expect(api.terminal.resize).not.toHaveBeenCalled();
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
    adapter.setVisible(true);
    adapter.setFocused(true);
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

  test("reroutes workspace arrow shortcuts before terminal applications receive them", async () => {
    vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
    installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
      platform: "darwin",
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    await waitFor(() => terminalMock.instances.length === 1);

    const event = keyboardEvent({
      altKey: true,
      key: "ArrowRight",
      metaKey: true,
      shiftKey: true,
    });
    expect(terminalMock.instances[0]?.customKeyHandler?.(event)).toBe(false);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
      metaKey: true,
      shiftKey: true,
      type: "keydown",
    });
  });

  test("reroutes configured control-alt workspace arrow shortcuts", async () => {
    vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
    useAppearanceStore.setState({
      draft: {
        shortcuts: { workspaceNavigation: "ctrl_alt_arrows" },
      } as ReturnType<typeof useAppearanceStore.getState>["draft"],
    });
    installSettaAPI({
      attach: vi.fn(async () => terminalResponse("terminal_existing", "running")),
      platform: "darwin",
    });
    const adapter = new TerminalSurfaceAdapter(fakePane(), "workspace_api");
    const host = createFakeHost();

    adapter.mount(host);
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    await waitFor(() => terminalMock.instances.length === 1);

    const event = keyboardEvent({
      altKey: true,
      ctrlKey: true,
      key: "ArrowLeft",
    });
    expect(terminalMock.instances[0]?.customKeyHandler?.(event)).toBe(false);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      altKey: true,
      ctrlKey: true,
      key: "ArrowLeft",
      metaKey: false,
      type: "keydown",
    });
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
    adapter.setVisible(true);
    adapter.setFocused(true);
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
    listProfiles?: ReturnType<typeof vi.fn>;
    openExternalUrl?: ReturnType<typeof vi.fn>;
    platform?: string;
    profiles?: TerminalProfileList;
    readClipboardText?: ReturnType<typeof vi.fn>;
    resize?: ReturnType<typeof vi.fn>;
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
      listProfiles:
        overrides.listProfiles ?? vi.fn(async () => overrides.profiles ?? terminalProfileList()),
      onEvent: vi.fn((listener: (event: TerminalEvent) => void) => {
        terminalListeners.push(listener);
        return () => {
          terminalListeners = terminalListeners.filter((candidate) => candidate !== listener);
        };
      }),
      resize:
        overrides.resize ??
        vi.fn(async (request: { cols: number; rows: number; sessionId: string }) =>
          terminalResponse(request.sessionId, "running", {
            cols: request.cols,
            rows: request.rows,
          }),
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

  function emitTerminalOutput(sessionId: string, text: string): void {
    emitTerminalEvent(
      terminalEvent("terminal.output", sessionId, {
        byteCount: Buffer.byteLength(text),
        dataBase64: Buffer.from(text).toString("base64"),
      }),
    );
  }

  function emitBackendStatus(status: { status: string; message: string }): void {
    for (const listener of backendStatusListeners) {
      listener(status);
    }
  }
});

function forceReattach(adapter: TerminalSurfaceAdapter): void {
  const reattachable = adapter as unknown as {
    reattachRequired: boolean;
    startSession(): void;
  };
  reattachable.reattachRequired = true;
  reattachable.startSession();
}

function terminalResponse(
  sessionId: string,
  status: TerminalSessionResponse["session"]["status"],
  overrides: Partial<TerminalSessionResponse["session"]> = {},
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
      ...overrides,
    },
  };
}

function terminalProfileList({
  defaultProfileId = "default",
  safeAutoStart = true,
}: {
  defaultProfileId?: string;
  safeAutoStart?: boolean;
} = {}): TerminalProfileList {
  return {
    defaultProfileId,
    detectedShells: [],
    profiles: [
      {
        args: defaultProfileId === "custom" ? ["serve"] : [],
        createdAt: "2026-06-06T12:00:00Z",
        cwd: "",
        cwdMode: "project",
        env: {},
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 13,
        id: defaultProfileId,
        launchMode: defaultProfileId === "custom" ? "custom-command" : "shell",
        name: defaultProfileId === "custom" ? "Custom" : "Default",
        safeAutoStart,
        scrollback: 1200,
        shellPath: defaultProfileId === "custom" ? "/usr/bin/env" : "",
        themeId: "setta-dark",
        updatedAt: "2026-06-06T12:00:00Z",
      },
    ],
  };
}

function runtimeSnapshot(
  activeRuntimeId: string,
  connectionStatus: RuntimeConnectionStatus,
): RuntimeRegistrySnapshot {
  return {
    activeRuntimeId,
    connection: {
      message: "",
      protocolVersion: 1,
      runtimeId: activeRuntimeId,
      status: connectionStatus,
      updatedAt: "2026-06-06T12:00:00Z",
    },
    runtimes: [
      {
        active: true,
        baseUrl: "https://runtime.example.test",
        connectionMessage: "",
        connectionStatus,
        displayName: activeRuntimeId,
        infrastructureProvider: {
          displayName: "Unknown provider",
          iconUrl: "",
          id: "unknown",
        },
        isLocal: activeRuntimeId === "local-runtime",
        lastConnected: null,
        runtimeId: activeRuntimeId,
      },
    ],
    switching: false,
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

function fakePane(): WorkspacePane {
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

function deferred<T>(): {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
} {
  let reject: (error: unknown) => void = () => {};
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

class FakeKeyboardEvent {
  readonly altKey: boolean;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly ctrlKey: boolean;
  defaultPrevented = false;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly type: string;

  constructor(type: string, init: KeyboardEventInit & { key?: string } = {}) {
    this.altKey = init.altKey ?? false;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
    this.ctrlKey = init.ctrlKey ?? false;
    this.key = init.key ?? "";
    this.metaKey = init.metaKey ?? false;
    this.shiftKey = init.shiftKey ?? false;
    this.type = type;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
