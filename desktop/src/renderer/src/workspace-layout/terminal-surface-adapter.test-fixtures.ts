import type {
  CloseTerminalRequest,
  CloseTerminalResponse,
  TerminalEvent,
  TerminalProfileList,
  TerminalSessionResponse,
} from "@generated/backend";
import type { RuntimeConnectionStatus, RuntimeRegistrySnapshot } from "@shared/types";
import { vi } from "vitest";

type MockFunction = ReturnType<typeof vi.fn>;

export interface InstallSettaAPIOverrides {
  attach?: MockFunction;
  close?: MockFunction;
  create?: MockFunction;
  listProfiles?: MockFunction;
  openExternalUrl?: MockFunction;
  platform?: string;
  profiles?: TerminalProfileList;
  readClipboardText?: MockFunction;
  resize?: MockFunction;
  writeClipboardText?: MockFunction;
}

interface InstalledTerminalAPI {
  attach: MockFunction;
  close: MockFunction;
  create: MockFunction;
  input: MockFunction;
  listProfiles: MockFunction;
  onEvent: MockFunction;
  resize: MockFunction;
}

interface InstalledSettaAPI {
  openExternalUrl: MockFunction;
  readClipboardText: MockFunction;
  terminal: InstalledTerminalAPI;
  writeClipboardText: MockFunction;
}

type TerminalListener = (event: TerminalEvent) => void;
type BackendStatus = { status: string; message: string };
type BackendStatusListener = (status: BackendStatus) => void;

export function createTerminalSettaAPIHarness(): {
  emitBackendStatus(status: BackendStatus): void;
  emitTerminalEvent(event: TerminalEvent): void;
  emitTerminalOutput(sessionId: string, text: string): void;
  install(overrides: InstallSettaAPIOverrides): InstalledSettaAPI;
} {
  let terminalListeners: TerminalListener[] = [];
  let backendStatusListeners: BackendStatusListener[] = [];

  function addTerminalListener(listener: TerminalListener): () => void {
    terminalListeners.push(listener);
    return () => {
      terminalListeners = terminalListeners.filter((candidate) => candidate !== listener);
    };
  }

  function addBackendStatusListener(listener: BackendStatusListener): () => void {
    backendStatusListeners.push(listener);
    return () => {
      backendStatusListeners = backendStatusListeners.filter((candidate) => candidate !== listener);
    };
  }

  function install(overrides: InstallSettaAPIOverrides): InstalledSettaAPI {
    const windowListeners = new Map<string, Set<EventListener>>();
    const localStorage = new MemoryStorage();
    const readClipboardText = withFallback(overrides.readClipboardText, defaultReadClipboardText);
    const writeClipboardText = withFallback(
      overrides.writeClipboardText,
      defaultWriteClipboardText,
    );
    const openExternalUrl = withFallback(overrides.openExternalUrl, defaultOpenExternalUrl);
    const terminal = createTerminalAPI(overrides, addTerminalListener);

    vi.stubGlobal(
      "window",
      createWindowStub({
        addBackendStatusListener,
        localStorage,
        openExternalUrl,
        platform: overrides.platform ?? "darwin",
        readClipboardText,
        terminal,
        windowListeners,
        writeClipboardText,
      }),
    );
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

  function emitBackendStatus(status: BackendStatus): void {
    for (const listener of backendStatusListeners) {
      listener(status);
    }
  }

  return { emitBackendStatus, emitTerminalEvent, emitTerminalOutput, install };
}

function createTerminalAPI(
  overrides: InstallSettaAPIOverrides,
  addTerminalListener: (listener: TerminalListener) => () => void,
): InstalledTerminalAPI {
  return {
    attach: withFallback(overrides.attach, defaultAttachTerminal),
    close: withFallback(overrides.close, defaultCloseTerminal),
    create: withFallback(overrides.create, defaultCreateTerminal),
    input: vi.fn(async () => ({ acceptedBytes: 0 })),
    listProfiles: withFallback(overrides.listProfiles, () => defaultListProfiles(overrides)),
    onEvent: vi.fn(addTerminalListener),
    resize: withFallback(overrides.resize, defaultResizeTerminal),
  };
}

function withFallback<T>(value: T | undefined, createDefault: () => T): T {
  if (value !== undefined) {
    return value;
  }
  return createDefault();
}

function defaultAttachTerminal(): MockFunction {
  return vi.fn(async () => terminalResponse("terminal_existing", "running"));
}

function defaultCloseTerminal(): MockFunction {
  return vi.fn(async (request: CloseTerminalRequest) =>
    closeTerminalResponse(request.sessionId, "closed"),
  );
}

function defaultCreateTerminal(): MockFunction {
  return vi.fn(async () => terminalResponse("terminal_created", "running"));
}

function defaultListProfiles(overrides: InstallSettaAPIOverrides): MockFunction {
  return vi.fn(async () => overrides.profiles ?? terminalProfileList());
}

function defaultResizeTerminal(): MockFunction {
  return vi.fn(async (request: { cols: number; rows: number; sessionId: string }) =>
    terminalResponse(request.sessionId, "running", {
      cols: request.cols,
      rows: request.rows,
    }),
  );
}

function defaultReadClipboardText(): MockFunction {
  return vi.fn(async () => "");
}

function defaultWriteClipboardText(): MockFunction {
  return vi.fn(async () => undefined);
}

function defaultOpenExternalUrl(): MockFunction {
  return vi.fn(async () => undefined);
}

function createWindowStub({
  addBackendStatusListener,
  localStorage,
  openExternalUrl,
  platform,
  readClipboardText,
  terminal,
  windowListeners,
  writeClipboardText,
}: {
  addBackendStatusListener: (listener: BackendStatusListener) => () => void;
  localStorage: Storage;
  openExternalUrl: MockFunction;
  platform: string;
  readClipboardText: MockFunction;
  terminal: InstalledTerminalAPI;
  windowListeners: Map<string, Set<EventListener>>;
  writeClipboardText: MockFunction;
}): object {
  return {
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
    dispatchEvent: (event: Event) => dispatchWindowEvent(windowListeners, event),
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
        platform,
      },
      backend: {
        onProcessStatus: addBackendStatusListener,
      },
      terminal,
    },
  };
}

function dispatchWindowEvent(
  windowListeners: Map<string, Set<EventListener>>,
  event: Event,
): boolean {
  for (const listener of windowListeners.get(event.type) ?? []) {
    listener(event);
  }
  return true;
}

export function terminalResponse(
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

export function closeTerminalResponse(
  sessionId: string,
  status: TerminalSessionResponse["session"]["status"],
  {
    kind = "closed",
    summary = "Close running terminal session?",
  }: {
    kind?: CloseTerminalResponse["kind"];
    summary?: string;
  } = {},
): CloseTerminalResponse {
  return {
    assessment: {
      reason: status === "closed" ? "idle_shell" : "foreground_process",
      requiresConfirmation: kind === "confirmation_required",
      safety: kind === "confirmation_required" ? "destructive" : "safe",
      summary,
    },
    kind,
    session: terminalResponse(sessionId, status).session,
  };
}

export function terminalProfileList({
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

export function runtimeSnapshot(
  activeRuntimeId: string,
  connectionStatus: RuntimeConnectionStatus,
): RuntimeRegistrySnapshot {
  return {
    activeRuntimeId,
    cloudResources: [],
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

export function terminalEvent(
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
