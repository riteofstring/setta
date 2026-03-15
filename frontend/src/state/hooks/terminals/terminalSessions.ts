import {
  createBootstrappedTerminalSession,
  type TerminalSession,
} from "./terminalSessionTransport";

export type { TerminalSession } from "./terminalSessionTransport";

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
    if (
      existing.refCount === 0 &&
      (existing.ws.readyState === WebSocket.CLOSING ||
        existing.ws.readyState === WebSocket.CLOSED)
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

  const session = createBootstrappedTerminalSession({
    sessionKey,
    projectConfigId,
    sectionId,
    shareSessionId,
    isDeploymentMode,
    container,
    getCurrentSession: (key) => TERMINAL_SESSIONS[key],
    queueResize: queueTerminalResize,
    flushResize: flushTerminalResize,
  });
  TERMINAL_SESSIONS[sessionKey] = session;
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
    session.ws.readyState === WebSocket.OPEN &&
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
  if (session.ws.readyState === WebSocket.OPEN) {
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

  const element = session.terminal.element;
  if (element && element.parentElement) {
    element.remove();
  }

  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.close();
  } else if (session.ws.readyState === WebSocket.CONNECTING) {
    session.ws.addEventListener("open", () => {
      session.ws.close();
    });
  }

  session.inputDisposable.dispose();
  session.resizeDisposable.dispose();
  deferTerminalDispose(session.terminal);
  delete TERMINAL_SESSIONS[sessionKey];
}

function deferTerminalDispose(terminal: TerminalSession["terminal"]) {
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
