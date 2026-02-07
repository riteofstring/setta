import { useEffect, useLayoutEffect, useRef } from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareSession } from "state/definitions";
import { C } from "utils/c";
import { C_ADDRESSES } from "utils/c_addresses";
import { replaceAddressParams } from "utils/endpointUtils";
import { RouteEnum } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  clearPendingSectionTextFocus,
  isPendingSectionTextFocus,
} from "utils/tabbingLogic";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { FitAddon } from "xterm-addon-fit";
import { scrollSensitivityUpdater, terminalTheme } from "./utils";

type TerminalSession = {
  ws: WebSocket;
  wsId: string;
  refCount: number;
  closeTimeoutId: number | null;
  isReady: boolean;
  terminal: Terminal;
  fitAddon: FitAddon;
  inputDisposable: { dispose: () => void };
  resizeDisposable: { dispose: () => void };
  pendingResizeMessage: string | null;
  pendingResizeTimeoutId: number | null;
};

// Keyed by `${projectConfigId}::${shareSessionId ?? ""}::${sectionId}`.
// We keep a single WebSocket per terminal section and re-use it across rapid
// mount/unmount cycles (StrictMode, attach/detach transitions) to avoid re-sending
// the full history and appending output multiple times.
const TERMINAL_SESSIONS: Record<string, TerminalSession> = {};

const TERMINAL_SESSION_CLOSE_DELAY_MS = 1200;
const TERMINAL_RESIZE_DEBOUNCE_MS = 120;

export function useTerminal({
  sectionId,
  width,
  height,
  setHasScrollbar,
}: {
  sectionId: string;
  width: number;
  height: number;
  setHasScrollbar: (value: boolean) => void;
}) {
  const terminalRef = useRef<HTMLDivElement | null>(null); // Ref for the terminal container
  const terminalReadyRef = useRef(false);
  const sessionRef = useRef<TerminalSession | null>(null);
  const isShareMode = useShareSession((x) => x.isShareMode);
  const shareSessionId = useShareSession((x) => x.shareSessionId);

  useLayoutEffect(() => {
    terminalReadyRef.current = false;
    const container = terminalRef.current;
    if (!container) {
      return;
    }
    if (isShareMode && !shareSessionId) {
      clearPendingSectionTextFocus(sectionId);
      return;
    }
    const sessionKey = getTerminalSessionKey(sectionId, shareSessionId);
    const session = acquireTerminalSession({
      sessionKey,
      sectionId,
      shareSessionId,
      isShareMode,
      container,
    });
    sessionRef.current = session;
    const { terminal, ws, fitAddon } = session;

    // Ensure the terminal matches the DOM size on mount/reattach.
    requestAnimationFrame(() => {
      fitTerminal({ container, fitAddon });
    });

    const resizeObserver = new ResizeObserver(() => {
      fitTerminal({ container, fitAddon });
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
        const active = document.activeElement;
        if (
          terminalReadyRef.current &&
          terminalRef.current &&
          active instanceof HTMLElement &&
          terminalRef.current.contains(active)
        ) {
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

    if (!isShareMode && isPendingSectionTextFocus(sectionId)) {
      requestAnimationFrame(() => focusTerminalInput());
    }

    let onReady: ((message: MessageEvent) => void) | null = null;
    const markReady = () => {
      terminalReadyRef.current = true;
      if (!isShareMode && isPendingSectionTextFocus(sectionId)) {
        requestAnimationFrame(() => focusTerminalInput());
      }
    };

    if (session.isReady) {
      markReady();
    } else {
      onReady = (message: MessageEvent) => {
        if (message.data === C.SETTA_TERMINAL_READY) {
          markReady();
          ws.removeEventListener("message", onReady!);
          onReady = null;
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
      sessionRef.current = null;
      releaseTerminalSession(sessionKey);
    };
  }, [isShareMode, shareSessionId]);

  useEffect(() => {
    const session = sessionRef.current;
    const container = terminalRef.current;
    if (!session || !container) {
      return;
    }
    fitTerminal({ container, fitAddon: session.fitAddon });
  }, [width, height]);

  return terminalRef;
}

function getTerminalSessionKey(
  sectionId: string,
  shareSessionId: string | null,
): string {
  const projectConfigId = getCurrProjectConfigId();
  const shareKey = shareSessionId ?? "";
  return `${projectConfigId}::${shareKey}::${sectionId}`;
}

function acquireTerminalSession({
  sessionKey,
  sectionId,
  shareSessionId,
  isShareMode,
  container,
}: {
  sessionKey: string;
  sectionId: string;
  shareSessionId: string | null;
  isShareMode: boolean;
  container: HTMLDivElement;
}): TerminalSession {
  const existing = TERMINAL_SESSIONS[sessionKey];
  if (existing) {
    existing.refCount += 1;
    if (existing.closeTimeoutId !== null) {
      window.clearTimeout(existing.closeTimeoutId);
      existing.closeTimeoutId = null;
    }
    attachTerminalToContainer(existing, container);
    existing.terminal.options.disableStdin = isShareMode;
    return existing;
  }

  const projectConfigId = getCurrProjectConfigId();
  const id = createNewId();
  const terminal = new Terminal({
    cursorBlink: true,
    theme: terminalTheme,
    disableStdin: isShareMode,
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
    wsId: id,
    refCount: 1,
    closeTimeoutId: null,
    isReady: false,
    terminal,
    fitAddon,
    inputDisposable: terminal.onData(() => {}),
    resizeDisposable: terminal.onResize(() => {}),
    pendingResizeMessage: null,
    pendingResizeTimeoutId: null,
  };
  TERMINAL_SESSIONS[sessionKey] = session;

  // Terminal -> backend input.
  session.inputDisposable.dispose();
  session.inputDisposable = terminal.onData((data) => {
    const shareSession = useShareSession.getState();
    if (shareSession.isShareMode) {
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
    if (typeof event.data === "string" && event.data === C.SETTA_TERMINAL_READY) {
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

  const cleanup = () => {
    delete TERMINAL_SESSIONS[sessionKey];
  };
  ws.addEventListener("close", cleanup);
  ws.addEventListener("error", cleanup);

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
  session.pendingResizeMessage = message;
  if (session.pendingResizeTimeoutId !== null) {
    window.clearTimeout(session.pendingResizeTimeoutId);
  }
  session.pendingResizeTimeoutId = window.setTimeout(() => {
    session.pendingResizeTimeoutId = null;
    flushTerminalResize(sessionKey);
  }, TERMINAL_RESIZE_DEBOUNCE_MS);
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
    session.pendingResizeMessage = null;
  }
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
      if (latest.pendingResizeTimeoutId !== null) {
        window.clearTimeout(latest.pendingResizeTimeoutId);
        latest.pendingResizeTimeoutId = null;
      }
      latest.pendingResizeMessage = null;
      if (latest.ws.readyState === 1) {
        latest.ws.close();
      } else {
        latest.ws.addEventListener("open", () => {
          latest.ws.close();
        });
      }
      latest.inputDisposable.dispose();
      latest.resizeDisposable.dispose();
      deferTerminalDispose(latest.terminal);
      delete TERMINAL_SESSIONS[sessionKey];
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

function fitTerminal({
  container,
  fitAddon,
}: {
  container: HTMLDivElement;
  fitAddon: FitAddon;
}) {
  // Avoid fitting while the container is effectively hidden, which can result
  // in 0x0 proposals and a "blank" terminal until the next resize.
  if (container.clientWidth < 16 || container.clientHeight < 16) {
    return;
  }
  fitAddon.fit();
}
