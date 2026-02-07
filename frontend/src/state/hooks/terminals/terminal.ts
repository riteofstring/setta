import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useLayoutEffect, useRef } from "react";
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

export function useTerminal({
  sectionId,
  setHasScrollbar,
}: {
  sectionId: string;
  setHasScrollbar: (value: boolean) => void;
}) {
  const terminalRef = useRef<HTMLDivElement | null>(null); // Ref for the terminal container
  const terminalReadyRef = useRef(false);
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
    const { terminal, ws, fitAddon } = session;

    // Ensure the terminal matches the DOM size on mount/reattach.
    requestAnimationFrame(() => {
      fitTerminal({
        container,
        fitAddon,
        terminal,
      });
    });

    const resizeObserver = new ResizeObserver(() => {
      fitTerminal({
        container,
        fitAddon,
        terminal,
      });
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
      releaseTerminalSession(sessionKey);
    };
  }, [isShareMode, shareSessionId]);

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
      existing.terminal.options.disableStdin = isShareMode;
      return existing;
    }
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
    lastSentResizeMessage: null,
    lastSentResizeTs: null,
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

function patchWrappedFlagsForWidenReflow(terminal: Terminal, oldCols: number) {
  // xterm only reflows lines that are marked as wrapped (`isWrapped=true` on the
  // continuation line). Some shells (notably zsh/ZLE) can redraw long command
  // lines using explicit cursor movement/linefeeds, which results in visually
  // wrapped lines that are not marked as wrapped, so widen reflow can't join
  // them. This patch heuristically marks recent "hard wrapped" lines as wrapped
  // just before we resize wider, so xterm can reflow them.
  //
  // This intentionally only scans near the cursor to reduce the chance of
  // corrupting scrollback that contains real newlines of exactly `oldCols`.
  const active = terminal.buffer.active;
  if (typeof active.length !== "number" || active.length <= 0) {
    return;
  }
  const absCursorY = active.baseY + active.cursorY;
  const scanStart = Math.max(1, absCursorY - 400);
  // Do not patch the wrapped group containing the cursor. xterm will skip
  // reflowing wrapped groups that contain the cursor when `reflowCursorLine`
  // is disabled (the default), so marking the prompt/current input as wrapped
  // can prevent the very reflow we're trying to enable for *previous* lines.
  //
  // Use xterm's current wrap flags to find the first line in the cursor's
  // wrapped group (usually the shell prompt + current input).
  let cursorGroupStart = absCursorY;
  while (cursorGroupStart > 0) {
    const line = active.getLine(cursorGroupStart);
    if (!line || !line.isWrapped) {
      break;
    }
    cursorGroupStart -= 1;
  }
  const scanEnd = Math.min(active.length - 1, cursorGroupStart - 1);

  const anyTerminal = terminal as any;
  const bufferService = anyTerminal?._core?._bufferService;
  const internalBuffer =
    bufferService?.buffer ?? bufferService?.buffers?.active ?? null;
  const internalLines =
    internalBuffer?.lines ??
    internalBuffer?._lines ??
    bufferService?.buffers?.active?.lines ??
    null;

  const readInternalLine = (lineView: any, y: number) => {
    if (lineView && typeof lineView === "object") {
      // xterm BufferLineApiView often keeps a reference to the internal line.
      if ("_line" in lineView) {
        return (lineView as any)._line;
      }
      if ("_bufferLine" in lineView) {
        return (lineView as any)._bufferLine;
      }
    }
    return internalLines?.get?.(y) ?? internalBuffer?.getLine?.(y) ?? null;
  };

  for (let y = scanStart; y <= scanEnd; y += 1) {
    const prevView = active.getLine(y - 1) as any;
    const lineView = active.getLine(y) as any;

    const prev = readInternalLine(prevView, y - 1);
    const line = readInternalLine(lineView, y);
    if (!prev || !line) {
      continue;
    }

    if (line.isWrapped) {
      continue;
    }

    const lineTrimmedLength =
      typeof line.getTrimmedLength === "function"
        ? line.getTrimmedLength()
        : typeof lineView?.translateToString === "function"
          ? lineView.translateToString(true).length
          : 0;
    if (lineTrimmedLength === 0) {
      continue;
    }

    // Only consider this a wrap continuation when the previous line is "full".
    // This mirrors xterm's own wrapping semantics and matches shells that break
    // the input line at the right margin.
    const prevTrimmedLength =
      typeof prev.getTrimmedLength === "function"
        ? prev.getTrimmedLength()
        : typeof prevView?.translateToString === "function"
          ? prevView.translateToString(true).length
          : 0;
    if (prevTrimmedLength !== oldCols && prevTrimmedLength !== oldCols - 1) {
      continue;
    }

    if (prevTrimmedLength === oldCols) {
      // Bail if the last cell is blank/space. (TrimmedLength should already
      // exclude whitespace, but guard anyway.)
      const lastCodePoint =
        typeof prev.getCodePoint === "function"
          ? prev.getCodePoint(oldCols - 1)
          : null;
      if (lastCodePoint === 0 || lastCodePoint === 32 || lastCodePoint === 9) {
        continue;
      }
    }

    if ("isWrapped" in (line as any)) {
      (line as any).isWrapped = true;
    } else if ("_isWrapped" in (line as any)) {
      (line as any)._isWrapped = true;
    } else {
      // Can't safely patch unknown line representations.
      continue;
    }
  }
}

function getDomScrollBarWidth(terminal: Terminal): number {
  if (terminal.options.scrollback === 0) {
    return 0;
  }
  const element = terminal.element;
  if (!element) {
    return 0;
  }
  const viewport = element.querySelector(".xterm-viewport");
  if (!(viewport instanceof HTMLElement)) {
    return 0;
  }
  return Math.max(0, viewport.offsetWidth - viewport.clientWidth);
}

function proposeDimensionsFallback(terminal: Terminal): {
  cols: number;
  rows: number;
} | null {
  // Avoid crashing on addon-fit bugs/mismatched versions by computing the
  // dimensions ourselves using xterm internals + DOM measurements.
  const element = terminal.element;
  if (!element || !element.parentElement) {
    return null;
  }
  const anyTerminal = terminal as any;
  const core = anyTerminal?._core;
  const dims = core?._renderService?.dimensions;
  const cellWidth = dims?.css?.cell?.width;
  const cellHeight = dims?.css?.cell?.height;
  if (
    typeof cellWidth !== "number" ||
    typeof cellHeight !== "number" ||
    cellWidth === 0 ||
    cellHeight === 0
  ) {
    return null;
  }

  const parentStyle = window.getComputedStyle(element.parentElement);
  const parentHeight = parseInt(parentStyle.getPropertyValue("height"), 10);
  const parentWidth = Math.max(
    0,
    parseInt(parentStyle.getPropertyValue("width"), 10),
  );
  if (!Number.isFinite(parentHeight) || !Number.isFinite(parentWidth)) {
    return null;
  }

  const termStyle = window.getComputedStyle(element);
  const paddingTop = parseInt(termStyle.getPropertyValue("padding-top"), 10);
  const paddingBottom = parseInt(
    termStyle.getPropertyValue("padding-bottom"),
    10,
  );
  const paddingLeft = parseInt(termStyle.getPropertyValue("padding-left"), 10);
  const paddingRight = parseInt(
    termStyle.getPropertyValue("padding-right"),
    10,
  );
  if (
    !Number.isFinite(paddingTop) ||
    !Number.isFinite(paddingBottom) ||
    !Number.isFinite(paddingLeft) ||
    !Number.isFinite(paddingRight)
  ) {
    return null;
  }

  const availableHeight = parentHeight - (paddingTop + paddingBottom);
  const availableWidth =
    parentWidth - (paddingLeft + paddingRight) - getDomScrollBarWidth(terminal);
  return {
    cols: Math.max(2, Math.floor(availableWidth / cellWidth)),
    rows: Math.max(1, Math.floor(availableHeight / cellHeight)),
  };
}

function fitTerminal({
  container,
  fitAddon,
  terminal,
}: {
  container: HTMLDivElement;
  fitAddon: FitAddon;
  terminal: Terminal;
}) {
  // Avoid fitting while the container is effectively hidden, which can result
  // in 0x0 proposals and a "blank" terminal until the next resize.
  if (container.clientWidth < 16 || container.clientHeight < 16) {
    return;
  }
  let proposed: { cols: number; rows: number } | null = null;
  const anyFitAddon = fitAddon as any;
  const proposeDisabled = Boolean(anyFitAddon.__settaProposeDisabled);
  if (!proposeDisabled) {
    try {
      const next = fitAddon.proposeDimensions();
      if (
        next &&
        typeof next.cols === "number" &&
        typeof next.rows === "number"
      ) {
        proposed = { cols: next.cols, rows: next.rows };
      }
    } catch (err) {
      // When addon-fit is mismatched with the xterm major version, proposeDimensions
      // can reliably throw. Disable subsequent propose calls for this instance to
      // avoid spamming logs and keep resizing responsive.
      anyFitAddon.__settaProposeDisabled = true;
    }
  }
  if (!proposed) {
    proposed = proposeDimensionsFallback(terminal);
  }
  if (!proposed) {
    return;
  }

  if (proposed.cols > terminal.cols && terminal.cols > 0) {
    patchWrappedFlagsForWidenReflow(terminal, terminal.cols);
  }
  if (
    proposed.cols > 0 &&
    proposed.rows > 0 &&
    (terminal.cols !== proposed.cols || terminal.rows !== proposed.rows)
  ) {
    const anyTerminal = terminal as any;
    const clear = anyTerminal?._core?._renderService?.clear;
    if (typeof clear === "function") {
      clear.call(anyTerminal._core._renderService);
    }
    terminal.resize(proposed.cols, proposed.rows);
  }
}
