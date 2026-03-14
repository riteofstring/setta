import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useShareSession } from "state/definitions";
import { C } from "utils/c";
import { C_ADDRESSES } from "utils/c_addresses";
import { replaceAddressParams } from "utils/endpointUtils";
import { RouteEnum } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { terminalTheme } from "./utils";

export type TerminalSession = {
  ws: WebSocket;
  refCount: number;
  closeTimeoutId: number | null;
  isReady: boolean;
  terminal: Terminal;
  fitAddon: FitAddon;
  inputDisposable: { dispose: () => void };
  resizeDisposable: { dispose: () => void };
  pendingResizeMessage: string | null;
  pendingResizeTimeoutId: number | null;
  lastSentResizeMessage: string | null;
  lastSentResizeTs: number | null;
};

type TerminalSessionKeyParams = {
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
};

type AcquireTerminalSessionParams = TerminalSessionKeyParams & {
  sessionKey: string;
  isDeploymentMode: boolean;
  container: HTMLDivElement;
};

// Keyed by `${projectConfigId}::${shareSessionId ?? ""}::${sectionId}`.
// We keep a single WebSocket per terminal section and re-use it across rapid
// mount/unmount cycles (StrictMode, attach/detach transitions) to avoid re-sending
// the full history and appending output multiple times.
const TERMINAL_SESSIONS: Record<string, TerminalSession> = {};

export const TERMINAL_SESSION_CLOSE_DELAY_MS = 1200;
// Leading-edge send + coalesced trailing send. Avoids long lag on widen (which
// can cause shells/programs to hard-wrap at the old cols, making "unwrapping"
// impossible later), while still keeping resize traffic bounded.
export const TERMINAL_RESIZE_THROTTLE_MS = 200;

export function getTerminalSessionKey({
  projectConfigId,
  sectionId,
  shareSessionId,
}: TerminalSessionKeyParams): string {
  const shareKey = shareSessionId ?? "";
  return `${projectConfigId}::${shareKey}::${sectionId}`;
}

export function acquireTerminalSession({
  sessionKey,
  projectConfigId,
  sectionId,
  shareSessionId,
  isDeploymentMode,
  container,
}: AcquireTerminalSessionParams): TerminalSession {
  const existing = TERMINAL_SESSIONS[sessionKey];
  if (existing) {
    // If the websocket has already died and nothing is currently mounted,
    // throw away the stale session so the next mount establishes a fresh one.
    if (
      existing.refCount === 0 &&
      (existing.ws.readyState === 2 || existing.ws.readyState === 3)
    ) {
      disposeTerminalSession(sessionKey, existing);
    } else {
      existing.refCount += 1;
      if (existing.closeTimeoutId !== null) {
        window.clearTimeout(existing.closeTimeoutId);
        existing.closeTimeoutId = null;
      }
      attachTerminalToContainer(existing, container);
      existing.terminal.options.disableStdin = isDeploymentMode;
      return existing;
    }
  }

  const id = createNewId();
  const terminal = new Terminal({
    cursorBlink: true,
    theme: terminalTheme,
    disableStdin: isDeploymentMode,
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container);
  const baseAddress = `${C_ADDRESSES.WEBSOCKET}${replaceAddressParams(
    RouteEnum.TERMINAL,
    { projectConfigId, sectionId, id },
  )}`;
  const wsTerminalAddress = shareSessionId
    ? `${baseAddress}?shareSessionId=${encodeURIComponent(shareSessionId)}`
    : baseAddress;
  const ws = new WebSocket(wsTerminalAddress);

  const session: TerminalSession = {
    ws,
    refCount: 1,
    closeTimeoutId: null,
    isReady: false,
    terminal,
    fitAddon,
    inputDisposable: terminal.onData(() => {}),
    resizeDisposable: terminal.onResize(() => {}),
    pendingResizeMessage: null,
    pendingResizeTimeoutId: null,
    lastSentResizeMessage: null,
    lastSentResizeTs: null,
  };
  TERMINAL_SESSIONS[sessionKey] = session;

  // Terminal -> backend input.
  session.inputDisposable.dispose();
  session.inputDisposable = terminal.onData((data) => {
    const shareSession = useShareSession.getState();
    if (shareSession.isDeploymentMode) {
      return;
    }
    if (!session.isReady) {
      return;
    }
    if (ws.readyState === 1) {
      ws.send(data);
    }
  });

  // Terminal -> backend resize (debounced, keep only the latest).
  session.resizeDisposable.dispose();
  session.resizeDisposable = terminal.onResize((size) => {
    const message = JSON.stringify({
      messageType: C.WS_TERMINAL_RESIZE,
      cols: size.cols,
      rows: size.rows,
    });
    queueTerminalResize(sessionKey, message);
  });

  ws.addEventListener("open", () => {
    if (TERMINAL_SESSIONS[sessionKey] !== session) {
      return;
    }
    flushTerminalResize(sessionKey);
  });

  ws.addEventListener("message", (event: MessageEvent) => {
    if (TERMINAL_SESSIONS[sessionKey] !== session) {
      return;
    }
    if (
      typeof event.data === "string" &&
      event.data === C.SETTA_TERMINAL_READY
    ) {
      session.isReady = true;
      return;
    }

    const appendText = (text: string) => {
      if (!text) {
        return;
      }
      session.terminal.write(text);
    };

    if (typeof event.data === "string") {
      appendText(event.data);
      return;
    }
    if (event.data instanceof ArrayBuffer) {
      appendText(new TextDecoder().decode(event.data));
      return;
    }
    if (event.data instanceof Blob) {
      event.data
        .arrayBuffer()
        .then((buffer) => {
          if (TERMINAL_SESSIONS[sessionKey] !== session) {
            return;
          }
          appendText(new TextDecoder().decode(buffer));
        })
        .catch(() => {
          // Ignore decode errors.
        });
    }
  });

  return session;
}

export function releaseTerminalSession(sessionKey: string) {
  const session = TERMINAL_SESSIONS[sessionKey];
  if (!session) {
    return;
  }

  session.refCount = Math.max(0, session.refCount - 1);
  if (session.refCount === 0) {
    if (session.closeTimeoutId !== null) {
      window.clearTimeout(session.closeTimeoutId);
    }
    session.closeTimeoutId = window.setTimeout(() => {
      const latest = TERMINAL_SESSIONS[sessionKey];
      if (!latest || latest.refCount !== 0) {
        return;
      }
      disposeTerminalSession(sessionKey, latest);
    }, TERMINAL_SESSION_CLOSE_DELAY_MS);
  }
}

export function clearTerminalSessions() {
  Object.entries(TERMINAL_SESSIONS).forEach(([sessionKey, session]) => {
    disposeTerminalSession(sessionKey, session);
  });
}

function queueTerminalResize(sessionKey: string, message: string) {
  const session = TERMINAL_SESSIONS[sessionKey];
  if (!session) {
    return;
  }
  if (
    session.lastSentResizeMessage === message &&
    !session.pendingResizeMessage
  ) {
    return;
  }

  session.pendingResizeMessage = message;

  const now = Date.now();
  const lastSent = session.lastSentResizeTs;
  const canSendNow =
    session.ws.readyState === 1 &&
    (lastSent === null || now - lastSent >= TERMINAL_RESIZE_THROTTLE_MS);

  if (canSendNow) {
    if (session.pendingResizeTimeoutId !== null) {
      window.clearTimeout(session.pendingResizeTimeoutId);
      session.pendingResizeTimeoutId = null;
    }
    flushTerminalResize(sessionKey);
    return;
  }

  if (session.pendingResizeTimeoutId !== null) {
    return;
  }

  const delay =
    lastSent === null
      ? TERMINAL_RESIZE_THROTTLE_MS
      : Math.max(TERMINAL_RESIZE_THROTTLE_MS - (now - lastSent), 0);
  session.pendingResizeTimeoutId = window.setTimeout(() => {
    const latest = TERMINAL_SESSIONS[sessionKey];
    if (!latest) {
      return;
    }
    latest.pendingResizeTimeoutId = null;
    flushTerminalResize(sessionKey);
  }, delay);
}

function flushTerminalResize(sessionKey: string) {
  const session = TERMINAL_SESSIONS[sessionKey];
  if (!session) {
    return;
  }
  const message = session.pendingResizeMessage;
  if (!message) {
    return;
  }
  if (session.ws.readyState === 1) {
    session.ws.send(message);
    session.lastSentResizeMessage = message;
    session.lastSentResizeTs = Date.now();
    session.pendingResizeMessage = null;
  }
}

function disposeTerminalSession(sessionKey: string, session: TerminalSession) {
  if (session.closeTimeoutId !== null) {
    window.clearTimeout(session.closeTimeoutId);
    session.closeTimeoutId = null;
  }
  if (session.pendingResizeTimeoutId !== null) {
    window.clearTimeout(session.pendingResizeTimeoutId);
    session.pendingResizeTimeoutId = null;
  }
  session.pendingResizeMessage = null;
  session.lastSentResizeMessage = null;
  session.lastSentResizeTs = null;

  // If we're disposing while still mounted (e.g. stale ws on remount), remove
  // the old terminal element so `terminal.open()` doesn't leave duplicates.
  const element = session.terminal.element;
  if (element && element.parentElement) {
    element.remove();
  }

  if (session.ws.readyState === 1) {
    session.ws.close();
  } else if (session.ws.readyState === 0) {
    session.ws.addEventListener("open", () => {
      session.ws.close();
    });
  }

  session.inputDisposable.dispose();
  session.resizeDisposable.dispose();
  deferTerminalDispose(session.terminal);
  delete TERMINAL_SESSIONS[sessionKey];
}

function deferTerminalDispose(terminal: Terminal) {
  // Work around an xterm.js dispose race that can throw:
  // "Cannot read properties of undefined (reading 'dimensions')".
  // Defer disposal past the next refresh tick.
  if (typeof requestAnimationFrame !== "function") {
    terminal.dispose();
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      terminal.dispose();
    });
  });
}

function attachTerminalToContainer(
  session: TerminalSession,
  container: HTMLDivElement,
) {
  const element = session.terminal.element;
  if (!element) {
    session.terminal.open(container);
    return;
  }
  if (element.parentElement === container) {
    return;
  }
  container.replaceChildren(element);
}
