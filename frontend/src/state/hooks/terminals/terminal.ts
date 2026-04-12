import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { C } from "utils/c";
import {
  clearPendingSectionTextFocus,
  isPendingSectionTextFocus,
} from "utils/tabbingLogic";
import { fitTerminal } from "./terminalSizing";
import { scrollSensitivityUpdater, terminalTheme } from "./utils";
import { buildTerminalWebsocketUrl } from "./websocketUrl";

type TerminalSession = {
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

// Keyed by `${projectConfigId}::${shareSessionId ?? ""}::${sectionId}`.
// We keep a single WebSocket per terminal section and re-use it across rapid
// mount/unmount cycles (StrictMode, attach/detach transitions) to avoid re-sending
// the full history and appending output multiple times.
const TERMINAL_SESSIONS: Record<string, TerminalSession> = {};

const TERMINAL_SESSION_CLOSE_DELAY_MS = 1200;
// Leading-edge send + coalesced trailing send. Avoids long lag on widen (which
// can cause shells/programs to hard-wrap at the old cols, making "unwrapping"
// impossible later), while still keeping resize traffic bounded.
const TERMINAL_RESIZE_THROTTLE_MS = 200;

function terminalContainsFocusedInput(
  terminalRef: RefObject<HTMLDivElement | null>,
  terminalReadyRef: RefObject<boolean>,
): boolean {
  const active = document.activeElement;
  const container = terminalRef.current;
  return (
    terminalReadyRef.current &&
    container instanceof HTMLElement &&
    active instanceof HTMLElement &&
    container.contains(active)
  );
}

export function useTerminal({
  sectionId,
  setHasScrollbar,
}: {
  sectionId: string;
  setHasScrollbar: (value: boolean) => void;
}) {
  const terminalRef = useRef<HTMLDivElement | null>(null); // Ref for the terminal container
  const terminalReadyRef = useRef(false);
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const shareSessionId = useShareSession((x) => x.shareSessionId);

  useLayoutEffect(() => {
    terminalReadyRef.current = false;
    const container = terminalRef.current;
    if (!container) {
      return;
    }
    if (isDeploymentMode && !shareSessionId) {
      clearPendingSectionTextFocus(sectionId);
      return;
    }
    if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
      clearPendingSectionTextFocus(sectionId);
      return;
    }
    const sessionKey = getTerminalSessionKey({
      projectConfigId,
      sectionId,
      shareSessionId,
    });
    const session = acquireTerminalSession({
      sessionKey,
      projectConfigId,
      sectionId,
      shareSessionId,
      isDeploymentMode,
      container,
    });
    const { terminal, ws, fitAddon } = session;

    const syncTerminalSize = () => {
      fitTerminal({
        container,
        fitAddon,
        terminal,
      });
      queueTerminalResizeFromCurrentSize(sessionKey, terminal, container);
    };

    // Ensure the terminal matches the DOM size on mount/reattach.
    requestAnimationFrame(syncTerminalSize);

    const resizeObserver = new ResizeObserver(() => {
      syncTerminalSize();
    });
    resizeObserver.observe(container);

    const focusTerminalInput = (attempt = 0) => {
      if (!isPendingSectionTextFocus(sectionId)) {
        return;
      }
      const focusTarget = terminalRef.current?.querySelector?.(
        ".xterm-helper-textarea, .xterm textarea",
      );
      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus({ preventScroll: true });
        terminal.focus();
        if (terminalContainsFocusedInput(terminalRef, terminalReadyRef)) {
          clearPendingSectionTextFocus(sectionId);
          return;
        }
      }
      terminal.focus();
      if (attempt < 240) {
        requestAnimationFrame(() => focusTerminalInput(attempt + 1));
      } else {
        clearPendingSectionTextFocus(sectionId);
      }
    };

    if (!isDeploymentMode && isPendingSectionTextFocus(sectionId)) {
      requestAnimationFrame(() => focusTerminalInput());
    }

    let onReady: ((message: MessageEvent) => void) | null = null;
    const markReady = () => {
      terminalReadyRef.current = true;
      if (!isDeploymentMode && isPendingSectionTextFocus(sectionId)) {
        requestAnimationFrame(() => focusTerminalInput());
      }
    };

    if (session.isReady) {
      markReady();
    } else {
      onReady = (message: MessageEvent) => {
        if (message.data === C.SETTA_TERMINAL_READY) {
          markReady();
          const readyListener = onReady;
          onReady = null;
          if (readyListener) {
            ws.removeEventListener("message", readyListener);
          }
        }
      };
      ws.addEventListener("message", onReady);
      // Handle the (rare) race where the session becomes ready between our first
      // `session.isReady` check and registering the listener.
      if (session.isReady) {
        markReady();
        ws.removeEventListener("message", onReady);
        onReady = null;
      }
    }

    const unsub = scrollSensitivityUpdater(terminal, setHasScrollbar);

    return () => {
      clearPendingSectionTextFocus(sectionId);
      if (onReady) {
        ws.removeEventListener("message", onReady);
      }
      resizeObserver.disconnect();
      unsub();
      releaseTerminalSession(sessionKey);
    };
  }, [
    isDeploymentMode,
    shareSessionId,
    projectConfigId,
    sectionId,
    setHasScrollbar,
  ]);

  return terminalRef;
}

function getTerminalSessionKey({
  projectConfigId,
  sectionId,
  shareSessionId,
}: {
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
}): string {
  const shareKey = shareSessionId ?? "";
  return `${projectConfigId}::${shareKey}::${sectionId}`;
}

function acquireTerminalSession({
  sessionKey,
  projectConfigId,
  sectionId,
  shareSessionId,
  isDeploymentMode,
  container,
}: {
  sessionKey: string;
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
  isDeploymentMode: boolean;
  container: HTMLDivElement;
}): TerminalSession {
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

  const terminal = new Terminal({
    cursorBlink: true,
    theme: terminalTheme,
    disableStdin: isDeploymentMode,
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container);
  const wsTerminalAddress = buildTerminalWebsocketUrl({
    projectConfigId,
    sectionId,
    shareSessionId,
  });
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
    flushTerminalResize(sessionKey);
  });

  ws.addEventListener("message", (event) => {
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

// const fontFamily = {
//   fontFamily:
//     'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;',
// };

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

function queueTerminalResizeFromCurrentSize(
  sessionKey: string,
  terminal: Terminal,
  container: HTMLDivElement,
) {
  if (container.clientWidth < 16 || container.clientHeight < 16) {
    return;
  }
  if (terminal.cols < 1 || terminal.rows < 1) {
    return;
  }
  queueTerminalResize(
    sessionKey,
    JSON.stringify({
      messageType: C.WS_TERMINAL_RESIZE,
      cols: terminal.cols,
      rows: terminal.rows,
    }),
  );
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
    return;
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

function releaseTerminalSession(sessionKey: string) {
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
