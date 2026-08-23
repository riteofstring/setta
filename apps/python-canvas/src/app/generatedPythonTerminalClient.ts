import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { getTerminalTicket } from "../backend/client";
import {
  PROJECT_TERMINAL_STREAM_PATH_V2,
  TERMINAL_STREAM_READY_TYPE_V2,
  TERMINAL_STREAM_RESIZE_TYPE_V2,
  type TerminalStreamReadyV2,
  type TerminalStreamResizeV2,
} from "../backend/generatedContract";

const TERMINAL_REUSE_DELAY_MS = 1_200;
const TERMINAL_RESIZE_THROTTLE_MS = 200;
const DEFAULT_TERMINAL_DIMENSIONS = { columns: 80, rows: 24 } as const;

type TerminalDimensions = {
  columns: number;
  rows: number;
};

type TerminalSession = {
  closeTimeout: number | null;
  disposed: boolean;
  fitAddon: FitAddon;
  inputDisposable: { dispose: () => void };
  isReady: boolean;
  lastResizeMessage: string | null;
  lastResizeTimestamp: number | null;
  pendingResizeMessage: string | null;
  pendingResizeTimeout: number | null;
  projectId: string;
  referenceCount: number;
  reportError: ((message: string) => void) | null;
  resizeDisposable: { dispose: () => void };
  socket: WebSocket | null;
  terminal: Terminal;
};

const sessions = new Map<string, TerminalSession>();

const terminalTheme = {
  background: "#06070A",
  black: "#272822",
  blue: "#66d9ef",
  brightBlack: "#75715e",
  brightBlue: "#66d9ef",
  brightCyan: "#a1efe4",
  brightGreen: "#a6e22e",
  brightMagenta: "#ae81ff",
  brightRed: "#f92672",
  brightWhite: "#f9f8f5",
  brightYellow: "#f4bf75",
  cursor: "#B8C2D5",
  cyan: "#a1efe4",
  foreground: "#B8C2D5",
  green: "#a6e22e",
  magenta: "#ae81ff",
  red: "#f92672",
  selectionBackground: "#49483e",
  white: "#f8f8f2",
  yellow: "#f4bf75",
} as const;

export function getGeneratedPythonTerminalDimensions(
  sessionKey: string | null,
): TerminalDimensions {
  const session = sessionKey === null ? undefined : sessions.get(sessionKey);
  if (!session) {
    return DEFAULT_TERMINAL_DIMENSIONS;
  }
  return {
    columns: positiveDimension(session.terminal.cols),
    rows: positiveDimension(session.terminal.rows),
  };
}

export function mountGeneratedPythonTerminal({
  container,
  onError,
  projectId,
  sessionKey,
}: {
  container: HTMLDivElement;
  onError: (message: string) => void;
  projectId: string;
  sessionKey: string;
}): () => void {
  let session = sessions.get(sessionKey);
  if (session && session.referenceCount === 0 && isSocketClosed(session)) {
    disposeTerminalSession(sessionKey, session);
    session = undefined;
  }
  if (!session) {
    session = createTerminalSession({ onError, projectId, sessionKey });
    sessions.set(sessionKey, session);
  }
  session.referenceCount += 1;
  session.reportError = onError;
  if (session.closeTimeout !== null) {
    window.clearTimeout(session.closeTimeout);
    session.closeTimeout = null;
  }
  attachTerminalToContainer(session.terminal, container);

  const syncTerminalSize = () => {
    fitTerminal(session);
    queueTerminalResize(sessionKey, session);
  };
  const frame = scheduleAnimationFrame(syncTerminalSize);
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => syncTerminalSize());
  resizeObserver?.observe(container);

  return () => {
    cancelScheduledAnimationFrame(frame);
    resizeObserver?.disconnect();
    releaseTerminalSession(sessionKey, session);
  };
}

export function disposeGeneratedPythonTerminal(sessionKey: string | null): void {
  if (sessionKey === null) {
    return;
  }
  const session = sessions.get(sessionKey);
  if (session) {
    disposeTerminalSession(sessionKey, session);
  }
}

function createTerminalSession({
  onError,
  projectId,
  sessionKey,
}: {
  onError: (message: string) => void;
  projectId: string;
  sessionKey: string;
}): TerminalSession {
  const terminal = new Terminal({ cursorBlink: true, theme: terminalTheme });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  const session: TerminalSession = {
    closeTimeout: null,
    disposed: false,
    fitAddon,
    inputDisposable: terminal.onData(() => {}),
    isReady: false,
    lastResizeMessage: null,
    lastResizeTimestamp: null,
    pendingResizeMessage: null,
    pendingResizeTimeout: null,
    projectId,
    referenceCount: 0,
    reportError: onError,
    resizeDisposable: terminal.onResize(() => {}),
    socket: null,
    terminal,
  };
  session.inputDisposable.dispose();
  session.inputDisposable = terminal.onData((data) => {
    if (!session.isReady || session.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    // Terminal input is binary UTF-8, including Ctrl+C (0x03), not a WebSocket text frame.
    session.socket.send(new TextEncoder().encode(data));
  });
  session.resizeDisposable.dispose();
  session.resizeDisposable = terminal.onResize(() => {
    queueTerminalResize(sessionKey, session);
  });
  void connectTerminalStream(sessionKey, session);
  return session;
}

async function connectTerminalStream(
  sessionKey: string,
  session: TerminalSession,
): Promise<void> {
  try {
    const { ticket } = await getTerminalTicket({ projectId: session.projectId });
    if (session.disposed || sessions.get(sessionKey) !== session) {
      return;
    }
    const socket = new WebSocket(buildTerminalStreamURL(ticket));
    socket.binaryType = "arraybuffer";
    session.socket = socket;
    socket.addEventListener("open", () => queueTerminalResize(sessionKey, session));
    socket.addEventListener("error", () => {
      reportTerminalError(session, "The terminal connection failed. Try again.");
    });
    socket.addEventListener("message", (event) => {
      handleTerminalMessage(sessionKey, session, event);
    });
  } catch {
    if (!session.disposed) {
      reportTerminalError(session, "Unable to attach the terminal. Try again.");
    }
  }
}

function buildTerminalStreamURL(ticket: string): string {
  const streamURL = new URL(PROJECT_TERMINAL_STREAM_PATH_V2, window.location.href);
  streamURL.protocol = streamURL.protocol === "https:" ? "wss:" : "ws:";
  streamURL.searchParams.set("ticket", ticket);
  return streamURL.toString();
}

function handleTerminalMessage(
  sessionKey: string,
  session: TerminalSession,
  event: MessageEvent,
): void {
  if (session.disposed || sessions.get(sessionKey) !== session) {
    return;
  }
  if (typeof event.data === "string") {
    if (!isTerminalReadyMessage(event.data)) {
      reportTerminalError(session, "The terminal stream returned an invalid control message.");
      session.socket?.close();
      return;
    }
    session.isReady = true;
    queueTerminalResize(sessionKey, session);
    return;
  }
  if (event.data instanceof ArrayBuffer) {
    writeTerminalBytes(session, event.data);
    return;
  }
  if (event.data instanceof Blob) {
    void event.data
      .arrayBuffer()
      .then((buffer) => {
        if (!session.disposed && sessions.get(sessionKey) === session) {
          writeTerminalBytes(session, buffer);
        }
      })
      .catch(() => {
        reportTerminalError(session, "The terminal stream could not be read.");
      });
  }
}

function isTerminalReadyMessage(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 1 ||
      !Object.hasOwn(parsed, "type")
    ) {
      return false;
    }
    const ready = parsed as TerminalStreamReadyV2;
    return ready.type === TERMINAL_STREAM_READY_TYPE_V2;
  } catch {
    return false;
  }
}

function writeTerminalBytes(session: TerminalSession, data: ArrayBuffer): void {
  session.terminal.write(new TextDecoder().decode(data));
}

function queueTerminalResize(sessionKey: string, session: TerminalSession): void {
  const dimensions = getGeneratedPythonTerminalDimensions(sessionKey);
  const message = JSON.stringify({
    columns: dimensions.columns,
    rows: dimensions.rows,
    type: TERMINAL_STREAM_RESIZE_TYPE_V2,
  } satisfies TerminalStreamResizeV2);
  if (
    session.lastResizeMessage === message &&
    session.pendingResizeMessage === null
  ) {
    return;
  }
  session.pendingResizeMessage = message;
  const now = Date.now();
  if (canSendResizeNow(session, now)) {
    clearPendingResizeTimeout(session);
    flushTerminalResize(session);
    return;
  }
  if (session.pendingResizeTimeout === null) {
    const delay = Math.max(
      TERMINAL_RESIZE_THROTTLE_MS -
        (now - (session.lastResizeTimestamp ?? now)),
      0,
    );
    session.pendingResizeTimeout = window.setTimeout(() => {
      session.pendingResizeTimeout = null;
      flushTerminalResize(session);
    }, delay);
  }
}

function canSendResizeNow(session: TerminalSession, now: number): boolean {
  return (
    session.isReady &&
    session.socket?.readyState === WebSocket.OPEN &&
    (session.lastResizeTimestamp === null ||
      now - session.lastResizeTimestamp >= TERMINAL_RESIZE_THROTTLE_MS)
  );
}

function flushTerminalResize(session: TerminalSession): void {
  const message = session.pendingResizeMessage;
  if (!message || session.socket?.readyState !== WebSocket.OPEN) {
    return;
  }
  session.socket.send(message);
  session.lastResizeMessage = message;
  session.lastResizeTimestamp = Date.now();
  session.pendingResizeMessage = null;
}

function fitTerminal(session: TerminalSession): void {
  try {
    session.fitAddon.fit();
  } catch {
    // xterm can briefly have no measurable cells while the canvas is mounting. The following
    // ResizeObserver callback retries once the joined pane has dimensions.
  }
}

function releaseTerminalSession(
  sessionKey: string,
  session: TerminalSession,
): void {
  session.referenceCount = Math.max(0, session.referenceCount - 1);
  if (session.referenceCount !== 0 || session.disposed) {
    return;
  }
  session.closeTimeout = window.setTimeout(() => {
    if (session.referenceCount === 0) {
      disposeTerminalSession(sessionKey, session);
    }
  }, TERMINAL_REUSE_DELAY_MS);
}

function disposeTerminalSession(sessionKey: string, session: TerminalSession): void {
  if (sessions.get(sessionKey) !== session || session.disposed) {
    return;
  }
  session.disposed = true;
  if (session.closeTimeout !== null) {
    window.clearTimeout(session.closeTimeout);
  }
  clearPendingResizeTimeout(session);
  const socket = session.socket;
  if (socket?.readyState === WebSocket.OPEN) {
    socket.close();
  } else if (socket?.readyState === WebSocket.CONNECTING) {
    socket.addEventListener("open", () => socket.close(), { once: true });
  }
  session.inputDisposable.dispose();
  session.resizeDisposable.dispose();
  session.terminal.dispose();
  sessions.delete(sessionKey);
}

function clearPendingResizeTimeout(session: TerminalSession): void {
  if (session.pendingResizeTimeout !== null) {
    window.clearTimeout(session.pendingResizeTimeout);
    session.pendingResizeTimeout = null;
  }
}

function isSocketClosed(session: TerminalSession): boolean {
  return (
    session.socket?.readyState === WebSocket.CLOSED ||
    session.socket?.readyState === WebSocket.CLOSING
  );
}

function attachTerminalToContainer(
  terminal: Terminal,
  container: HTMLDivElement,
): void {
  const element = terminal.element;
  if (!element) {
    terminal.open(container);
    return;
  }
  if (element.parentElement !== container) {
    container.replaceChildren(element);
  }
}

function reportTerminalError(session: TerminalSession, message: string): void {
  if (!session.disposed && session.referenceCount > 0) {
    session.reportError?.(message);
  }
}

function positiveDimension(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function scheduleAnimationFrame(callback: () => void): number {
  return typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(callback, 0);
}

function cancelScheduledAnimationFrame(handle: number): void {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(handle);
  } else {
    window.clearTimeout(handle);
  }
}
