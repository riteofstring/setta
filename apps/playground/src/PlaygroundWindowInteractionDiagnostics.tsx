import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const DIAGNOSTIC_STORAGE_KEY =
  "setta-playground-window-interaction-diagnostics-v1";
const WINDOW_SELECTOR = '[data-testid="workspace-window-manager-window"]';
const DRAG_HANDLE_SELECTOR = '[data-workspace-window-drag-handle="true"]';
const TITLE_DISPLAY_SELECTOR =
  '[data-setta-workspace-section-title-display="true"]';
const INTERACTIVE_SELECTOR =
  "button, [role='button'], [role='menuitem'], input, textarea, select, a, [contenteditable='true']";
const RECORDED_EVENT_TYPES = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "gotpointercapture",
  "lostpointercapture",
  "click",
  "dblclick",
  "wheel",
] as const;

type PointerSession = {
  readonly startedAt: number;
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastY: number;
  moveCount: number;
};

type TargetSnapshot = {
  readonly dragHandle: HTMLElement | null;
  readonly isEditingControl: boolean;
  readonly isInteractiveControl: boolean;
  readonly isSectionTitleDisplay: boolean;
  readonly nearestTestId: string | null;
  readonly role: string | null;
  readonly scrollOwner: HTMLElement | null;
  readonly tag: string;
  readonly wheelBoundary: "all" | "manual" | "vertical" | null;
};

function readStoredDiagnosticLines(): readonly string[] {
  try {
    const value = globalThis.sessionStorage?.getItem(DIAGNOSTIC_STORAGE_KEY);
    return value ? value.split("\n").filter(Boolean) : [];
  } catch (error) {
    if (error instanceof DOMException) return [];
    throw error;
  }
}

function storeDiagnosticLines(lines: readonly string[]): void {
  try {
    globalThis.sessionStorage?.setItem(
      DIAGNOSTIC_STORAGE_KEY,
      lines.join("\n"),
    );
  } catch (error) {
    if (error instanceof DOMException) return;
    throw error;
  }
}

export function appendPlaygroundWindowDiagnosticLine(
  lines: string[],
  entry: Record<string, unknown>,
  recordedAt = new Date().toISOString(),
): void {
  lines.push(JSON.stringify({ recordedAt, ...entry }));
}

function getContainedClosest(
  target: Element,
  selector: string,
  boundary: Element,
): Element | null {
  const candidate = target.closest(selector);
  return candidate && boundary.contains(candidate) ? candidate : null;
}

function getWheelBoundary(
  boundary: Element | null,
): TargetSnapshot["wheelBoundary"] {
  if (!boundary) return null;
  if (boundary.classList.contains("setta-manual-wheel")) return "manual";
  if (boundary.classList.contains("nowheel")) return "all";
  if (boundary.classList.contains("setta-native-wheel-y")) return "vertical";
  return null;
}

function ownsNativeScrollAxis(
  overflow: string,
  scrollSize: number,
  clientSize: number,
): boolean {
  return (
    (overflow === "auto" || overflow === "scroll") &&
    scrollSize > clientSize + 1
  );
}

function isNativeScrollOwner(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    ownsNativeScrollAxis(
      style.overflowX,
      element.scrollWidth,
      element.clientWidth,
    ) ||
    ownsNativeScrollAxis(
      style.overflowY,
      element.scrollHeight,
      element.clientHeight,
    )
  );
}

function getNativeScrollOwner(
  target: Element,
  windowElement: HTMLElement,
): HTMLElement | null {
  let candidate: HTMLElement | null =
    target instanceof HTMLElement ? target : target.parentElement;
  while (candidate && windowElement.contains(candidate)) {
    if (isNativeScrollOwner(candidate)) return candidate;
    if (candidate === windowElement) return null;
    candidate = candidate.parentElement;
  }
  return null;
}

function getTargetSnapshot(
  target: Element,
  windowElement: HTMLElement,
): TargetSnapshot {
  const testTarget = getContainedClosest(
    target,
    "[data-testid]",
    windowElement,
  );
  const dragHandle = getContainedClosest(
    target,
    DRAG_HANDLE_SELECTOR,
    windowElement,
  );
  const wheelBoundary = getContainedClosest(
    target,
    ".setta-manual-wheel, .nowheel, .setta-native-wheel-y",
    windowElement,
  );
  return {
    dragHandle: dragHandle instanceof HTMLElement ? dragHandle : null,
    isEditingControl:
      getContainedClosest(
        target,
        "input, textarea, select, [contenteditable='true']",
        windowElement,
      ) !== null,
    isInteractiveControl:
      getContainedClosest(target, INTERACTIVE_SELECTOR, windowElement) !== null,
    isSectionTitleDisplay:
      getContainedClosest(target, TITLE_DISPLAY_SELECTOR, windowElement) !==
      null,
    nearestTestId: testTarget?.getAttribute("data-testid") ?? null,
    role: target.getAttribute("role"),
    scrollOwner: getNativeScrollOwner(target, windowElement),
    tag: target.tagName.toLowerCase(),
    wheelBoundary: getWheelBoundary(wheelBoundary),
  };
}

function getWindowBounds(windowElement: HTMLElement): {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
} {
  const bounds = windowElement.getBoundingClientRect();
  return {
    height: Math.round(bounds.height),
    left: Math.round(bounds.left),
    top: Math.round(bounds.top),
    width: Math.round(bounds.width),
  };
}

function isPointerEventLike(
  event: Event,
): event is Event &
  Pick<
    PointerEvent,
    | "button"
    | "buttons"
    | "clientX"
    | "clientY"
    | "detail"
    | "pointerId"
    | "pointerType"
  > {
  return "pointerId" in event && typeof event.pointerId === "number";
}

function getPointerCaptureState(
  dragHandle: HTMLElement | null,
  event: Event,
): boolean | null {
  if (
    !dragHandle ||
    !isPointerEventLike(event) ||
    typeof dragHandle.hasPointerCapture !== "function"
  ) {
    return null;
  }
  return dragHandle.hasPointerCapture(event.pointerId);
}

function isPointerFinished(event: Event): boolean {
  return event.type === "pointerup" || event.type === "pointercancel";
}

function getPointerDiagnostic(
  event: Event,
  session: PointerSession | undefined,
): Record<string, unknown> | undefined {
  if (!isPointerEventLike(event)) return undefined;
  const pointer = {
    button: event.button,
    buttons: event.buttons,
    clientX: Math.round(event.clientX),
    clientY: Math.round(event.clientY),
    detail: event.detail,
    pointerId: event.pointerId,
    pointerType: event.pointerType || "unknown",
  };
  if (!isPointerFinished(event) || !session) return pointer;
  return {
    ...pointer,
    gesture: {
      deltaX: Math.round(event.clientX - session.startX),
      deltaY: Math.round(event.clientY - session.startY),
      durationMs: Math.round(performance.now() - session.startedAt),
      moveCount: session.moveCount,
    },
  };
}

function getWheelDiagnostic(event: Event): Record<string, unknown> | undefined {
  if (!(event instanceof WheelEvent)) return undefined;
  return {
    ctrlKey: event.ctrlKey,
    deltaMode: event.deltaMode,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    shiftKey: event.shiftKey,
  };
}

function getNativeScrollDiagnostic(
  scrollOwner: HTMLElement | null,
): Record<string, unknown> | null {
  if (!scrollOwner) return null;
  const style = getComputedStyle(scrollOwner);
  return {
    clientHeight: scrollOwner.clientHeight,
    clientWidth: scrollOwner.clientWidth,
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    scrollHeight: scrollOwner.scrollHeight,
    scrollLeft: scrollOwner.scrollLeft,
    scrollTop: scrollOwner.scrollTop,
    scrollWidth: scrollOwner.scrollWidth,
  };
}

function getCurrentWindow(
  root: HTMLElement,
  windowId: string | null,
): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>(WINDOW_SELECTOR)).find(
    (candidate) => candidate.dataset.workspaceWindowId === windowId,
  );
}

function buildRecordedDiagnostic({
  currentWindow,
  event,
  pointerSession,
  root,
  targetSnapshot,
  windowElement,
  windowId,
}: {
  readonly currentWindow: HTMLElement | undefined;
  readonly event: Event;
  readonly pointerSession: PointerSession | undefined;
  readonly root: HTMLElement;
  readonly targetSnapshot: TargetSnapshot;
  readonly windowElement: HTMLElement;
  readonly windowId: string | null;
}): Record<string, unknown> {
  const resolvedWindow = currentWindow ?? windowElement;
  return {
    canvasInteractionActive:
      root.querySelector('[data-viewport-interaction-active="true"]') !== null,
    cancelable: event.cancelable,
    defaultPrevented: event.defaultPrevented,
    event: event.type,
    isTrusted: event.isTrusted,
    pointer: getPointerDiagnostic(event, pointerSession),
    pointerCaptured: getPointerCaptureState(targetSnapshot.dragHandle, event),
    surface: windowElement.querySelector(
      '[data-testid="section-window-surface"]',
    )
      ? "section"
      : "generic",
    target: {
      isEditingControl: targetSnapshot.isEditingControl,
      isInteractiveControl: targetSnapshot.isInteractiveControl,
      isSectionTitleDisplay: targetSnapshot.isSectionTitleDisplay,
      isWithinDragHandle: targetSnapshot.dragHandle !== null,
      nativeScroll: getNativeScrollDiagnostic(targetSnapshot.scrollOwner),
      nearestTestId: targetSnapshot.nearestTestId,
      role: targetSnapshot.role,
      tag: targetSnapshot.tag,
      wheelBoundary: targetSnapshot.wheelBoundary,
    },
    wheel: getWheelDiagnostic(event),
    windowBounds: getWindowBounds(resolvedWindow),
    windowId,
    windowOverscrollBehavior:
      getComputedStyle(resolvedWindow).overscrollBehavior,
  };
}

function appendRecordedEvent({
  appendDiagnostic,
  event,
  pointerSessions,
  root,
  targetSnapshot,
  windowElement,
}: {
  readonly appendDiagnostic: (
    entry: Record<string, unknown>,
    deferPresentation?: boolean,
  ) => void;
  readonly event: Event;
  readonly pointerSessions: Map<number, PointerSession>;
  readonly root: HTMLElement;
  readonly targetSnapshot: TargetSnapshot;
  readonly windowElement: HTMLElement;
}): void {
  const windowId = windowElement.dataset.workspaceWindowId ?? null;
  const currentWindow = getCurrentWindow(root, windowId);
  const pointerSession = isPointerEventLike(event)
    ? pointerSessions.get(event.pointerId)
    : undefined;
  appendDiagnostic(
    buildRecordedDiagnostic({
      currentWindow,
      event,
      pointerSession,
      root,
      targetSnapshot,
      windowElement,
      windowId,
    }),
    event.type === "pointermove" || event.type === "wheel",
  );
  if (isPointerFinished(event) && isPointerEventLike(event)) {
    pointerSessions.delete(event.pointerId);
  }
}

export function PlaygroundWindowInteractionDiagnostics({
  rootRef,
}: {
  readonly rootRef: RefObject<HTMLDivElement | null>;
}) {
  const diagnosticLinesRef = useRef<string[]>([...readStoredDiagnosticLines()]);
  const pointerSessionsRef = useRef(new Map<number, PointerSession>());
  const [enabled, setEnabled] = useState(false);
  const [revision, setRevision] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");

  const appendDiagnostic = useCallback(
    (entry: Record<string, unknown>, deferPresentation = false) => {
      appendPlaygroundWindowDiagnosticLine(diagnosticLinesRef.current, entry);
      // Pointer moves and wheel bursts stay memory-only until the next lifecycle event. This keeps
      // full-fidelity traces without synchronous sessionStorage writes or React renders changing
      // the interaction being measured. Pointer up, the next pointer down, or Stop recording
      // flushes the complete accumulated log.
      if (deferPresentation) return;
      storeDiagnosticLines(diagnosticLinesRef.current);
      setRevision((current) => current + 1);
    },
    [],
  );

  useEffect(() => () => storeDiagnosticLines(diagnosticLinesRef.current), []);

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;
    const pointerSessions = pointerSessionsRef.current;
    let active = true;

    const recordEvent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const windowElement = target.closest<HTMLElement>(WINDOW_SELECTOR);
      if (!windowElement || !root.contains(windowElement)) return;
      const targetSnapshot = getTargetSnapshot(target, windowElement);

      if (event.type === "pointermove") {
        if (!isPointerEventLike(event)) return;
        const session = pointerSessions.get(event.pointerId);
        if (!session) return;
        session.lastX = event.clientX;
        session.lastY = event.clientY;
        session.moveCount += 1;
      }

      if (event.type === "pointerdown" && isPointerEventLike(event)) {
        pointerSessions.set(event.pointerId, {
          lastX: event.clientX,
          lastY: event.clientY,
          moveCount: 0,
          startedAt: performance.now(),
          startX: event.clientX,
          startY: event.clientY,
        });
      }

      queueMicrotask(() => {
        if (!active) return;
        appendRecordedEvent({
          appendDiagnostic,
          event,
          pointerSessions,
          root,
          targetSnapshot,
          windowElement,
        });
      });
    };

    for (const eventType of RECORDED_EVENT_TYPES) {
      root.addEventListener(eventType, recordEvent, true);
    }
    return () => {
      active = false;
      pointerSessions.clear();
      for (const eventType of RECORDED_EVENT_TYPES) {
        root.removeEventListener(eventType, recordEvent, true);
      }
    };
  }, [appendDiagnostic, enabled, rootRef]);

  const diagnosticText = diagnosticLinesRef.current.join("\n");
  const toggleRecording = () => {
    const nextEnabled = !enabled;
    appendDiagnostic({
      event: nextEnabled ? "recording_started" : "recording_stopped",
    });
    setCopyStatus("");
    setEnabled(nextEnabled);
  };
  const clearDiagnostics = () => {
    diagnosticLinesRef.current = [];
    storeDiagnosticLines([]);
    setCopyStatus("");
    setRevision((current) => current + 1);
  };
  const copyDiagnostics = async () => {
    if (!navigator.clipboard) {
      setCopyStatus("Clipboard unavailable; select the log below.");
      return;
    }
    try {
      await navigator.clipboard.writeText(diagnosticText);
      setCopyStatus("Copied.");
    } catch (error) {
      setCopyStatus(
        `Copy failed: ${error instanceof Error ? error.message : "unknown clipboard error"}`,
      );
    }
  };

  return (
    <section
      className="playground-window-interaction-diagnostics"
      data-testid="playground-window-interaction-diagnostics"
      data-revision={revision}
    >
      <h3>Window interaction diagnostics</h3>
      <p>
        Records event routing, pointer capture, window geometry, and wheel
        deltas only. It does not record section or field content.
      </p>
      <div className="playground-window-interaction-diagnostic-actions">
        <button
          className="playground-pane-action"
          data-testid="playground-window-diagnostics-toggle"
          onClick={toggleRecording}
          type="button"
        >
          {enabled ? "Stop recording" : "Start recording"}
        </button>
        <button
          className="playground-pane-action"
          data-testid="playground-window-diagnostics-copy"
          disabled={diagnosticText === ""}
          onClick={() => void copyDiagnostics()}
          type="button"
        >
          Copy log
        </button>
        <button
          className="playground-pane-action"
          data-testid="playground-window-diagnostics-clear"
          disabled={diagnosticText === ""}
          onClick={clearDiagnostics}
          type="button"
        >
          Clear
        </button>
      </div>
      <p aria-live="polite" data-testid="playground-window-diagnostics-status">
        {enabled ? "Recording" : "Stopped"} ·{" "}
        {diagnosticLinesRef.current.length} events
        {copyStatus ? ` · ${copyStatus}` : ""}
      </p>
      <textarea
        aria-label="Window interaction diagnostic log"
        readOnly
        rows={8}
        value={diagnosticText}
      />
    </section>
  );
}
