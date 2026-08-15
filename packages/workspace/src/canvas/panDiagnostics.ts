import { useEffect, type RefObject } from "react";
import { useDndState } from "../dnd/dndState";
import {
  MANUAL_WHEEL_CLASS_NAME,
  NATIVE_VERTICAL_WHEEL_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "../interaction";
import { useWorkspaceOptions } from "./options";
import { useReactFlow } from "./store";

export type WorkspacePanDiagnosticPhase =
  | "filter"
  | "raw-pointer-down"
  | "raw-pointer-move"
  | "raw-pointer-up"
  | "raw-pointer-cancel"
  | "raw-wheel-capture"
  | "raw-wheel-bubble"
  | "window-blur"
  | "window-focus"
  | "page-hide"
  | "page-show"
  | "visibility-change"
  | "gesture-start"
  | "gesture-move"
  | "gesture-end"
  | "pan-scroll-start"
  | "pan-scroll-end"
  | "wheel-disposition"
  | "wheel-handler-bind"
  | "wheel-handler-cleanup"
  | "wheel-pan"
  | "wheel-pinch"
  | "wheel-skip"
  | "wheel-zoom-start"
  | "wheel-zoom"
  | "wheel-zoom-end"
  | "interaction-reset";

export type WorkspacePanDiagnosticEvent = {
  sequence: number;
  timestampMs: number;
  phase: WorkspacePanDiagnosticPhase;
  source: WorkspacePanDiagnosticSource | null;
  target: WorkspacePanDiagnosticTarget | null;
  state: WorkspacePanDiagnosticState;
  details: Readonly<Record<string, unknown>>;
};

export type WorkspacePanDiagnosticLogger = (event: WorkspacePanDiagnosticEvent) => void;

type WorkspacePanDiagnosticSource = {
  type: string;
  eventTimestampMs: number;
  defaultPrevented: boolean;
  cancelable: boolean;
  eventPhase: number;
  isTrusted: boolean;
  button: number | null;
  buttons: number | null;
  clientX: number | null;
  clientY: number | null;
  movementX: number | null;
  movementY: number | null;
  deltaX: number | null;
  deltaY: number | null;
  deltaMode: number | null;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  touchCount: number | null;
};

type WorkspacePanDiagnosticTarget = {
  tagName: string;
  id: string | null;
  classNames: ReadonlyArray<string>;
  sectionId: string | null;
  sectionPresentation: string | null;
  nodeId: string | null;
  noPan: boolean;
  noWheel: boolean;
  manualWheel: boolean;
  nativeVerticalWheel: boolean;
  insideWorkspace: boolean;
  insideZoomRenderer: boolean;
};

type WorkspacePanDiagnosticState = {
  transform: readonly [number, number, number];
  paneDragging: boolean;
  viewportInteractionActive: boolean;
  userSelectionActive: boolean;
  selectionKeyPressed: boolean;
  panActivationKeyPressed: boolean;
  zoomActivationKeyPressed: boolean;
  panOnDrag: boolean | ReadonlyArray<number>;
  panOnScroll: boolean;
  panOnScrollMode: string;
  activeDndId: string | null;
  dndIsSorting: boolean;
  dndIsMovingFree: boolean;
  dndPendingDeactivation: boolean;
  d3SelectionPresent: boolean;
  d3ZoomPresent: boolean;
  originalWheelHandlerPresent: boolean;
  installedWheelHandlerPresent: boolean;
  installedWheelHandlerIsOriginal: boolean;
  documentHasFocus: boolean;
  documentVisibilityState: DocumentVisibilityState;
  canvasConnected: boolean;
  canvasScrollLeft: number | null;
  canvasScrollTop: number | null;
  canvasScrollWidth: number | null;
  canvasScrollHeight: number | null;
};

type EmitWorkspacePanDiagnosticParams = {
  phase: WorkspacePanDiagnosticPhase;
  sourceEvent?: Event | null;
  details?: Readonly<Record<string, unknown>>;
};

let diagnosticLogger: WorkspacePanDiagnosticLogger | null = null;
let diagnosticSequence = 0;

/**
 * Installs an opt-in sink for structured canvas pan diagnostics. Passing `null` disables it.
 * Install the sink before mounting `WorkspaceCanvas` to include raw pointer and wheel input.
 * The workspace does not log unless a host explicitly installs a sink.
 */
export function setWorkspacePanDiagnosticLogger(logger: WorkspacePanDiagnosticLogger | null): void {
  diagnosticLogger = logger;
  diagnosticSequence = 0;
}

export function isWorkspacePanDiagnosticsEnabled(): boolean {
  return diagnosticLogger !== null;
}

export function emitWorkspacePanDiagnostic({
  phase,
  sourceEvent = null,
  details = {},
}: EmitWorkspacePanDiagnosticParams): void {
  if (!diagnosticLogger) {
    return;
  }

  diagnosticSequence += 1;
  diagnosticLogger({
    sequence: diagnosticSequence,
    timestampMs: Date.now(),
    phase,
    source: snapshotSourceEvent(sourceEvent),
    target: snapshotEventTarget(sourceEvent?.target ?? null),
    state: snapshotInteractionState(),
    details,
  });
}

export function useWorkspacePanRawInputDiagnostics(
  zoomPane: RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    if (!isWorkspacePanDiagnosticsEnabled()) {
      return;
    }

    let activePointerId: number | null = null;
    const isInsideZoomPane = (event: Event): boolean => {
      const pane = zoomPane.current;
      return pane !== null && event.composedPath().includes(pane);
    };
    const emitPointer = (
      phase: "raw-pointer-down" | "raw-pointer-move" | "raw-pointer-up" | "raw-pointer-cancel",
      event: PointerEvent,
    ) => {
      emitWorkspacePanDiagnostic({
        phase,
        sourceEvent: event,
        details: {
          insideZoomPane: isInsideZoomPane(event),
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
          pressure: event.pressure,
        },
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      activePointerId = event.pointerId;
      emitPointer("raw-pointer-down", event);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId === activePointerId) {
        emitPointer("raw-pointer-move", event);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) {
        return;
      }
      emitPointer("raw-pointer-up", event);
      activePointerId = null;
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) {
        return;
      }
      emitPointer("raw-pointer-cancel", event);
      activePointerId = null;
    };
    const onWheelCapture = (event: WheelEvent) => {
      emitWorkspacePanDiagnostic({
        phase: "raw-wheel-capture",
        sourceEvent: event,
        details: { insideZoomPane: isInsideZoomPane(event) },
      });
    };
    const onWheelBubble = (event: WheelEvent) => {
      emitWorkspacePanDiagnostic({
        phase: "raw-wheel-bubble",
        sourceEvent: event,
        details: { insideZoomPane: isInsideZoomPane(event) },
      });
    };
    const onWindowBlur = (event: FocusEvent) => {
      emitWorkspacePanDiagnostic({ phase: "window-blur", sourceEvent: event });
    };
    const onWindowFocus = (event: FocusEvent) => {
      emitWorkspacePanDiagnostic({ phase: "window-focus", sourceEvent: event });
    };
    const onPageHide = (event: PageTransitionEvent) => {
      emitWorkspacePanDiagnostic({
        phase: "page-hide",
        sourceEvent: event,
        details: { persisted: event.persisted },
      });
    };
    const onPageShow = (event: PageTransitionEvent) => {
      emitWorkspacePanDiagnostic({
        phase: "page-show",
        sourceEvent: event,
        details: { persisted: event.persisted },
      });
    };
    const onVisibilityChange = (event: Event) => {
      emitWorkspacePanDiagnostic({ phase: "visibility-change", sourceEvent: event });
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("wheel", onWheelCapture, true);
    window.addEventListener("wheel", onWheelBubble);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      window.removeEventListener("wheel", onWheelCapture, true);
      window.removeEventListener("wheel", onWheelBubble);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [zoomPane]);
}

function snapshotSourceEvent(event: Event | null): WorkspacePanDiagnosticSource | null {
  if (!event) {
    return null;
  }

  return {
    type: event.type,
    eventTimestampMs: event.timeStamp,
    defaultPrevented: event.defaultPrevented,
    cancelable: event.cancelable,
    eventPhase: event.eventPhase,
    isTrusted: event.isTrusted,
    button: readFiniteNumber(event, "button"),
    buttons: readFiniteNumber(event, "buttons"),
    clientX: readFiniteNumber(event, "clientX"),
    clientY: readFiniteNumber(event, "clientY"),
    movementX: readFiniteNumber(event, "movementX"),
    movementY: readFiniteNumber(event, "movementY"),
    deltaX: readFiniteNumber(event, "deltaX"),
    deltaY: readFiniteNumber(event, "deltaY"),
    deltaMode: readFiniteNumber(event, "deltaMode"),
    ctrlKey: readBoolean(event, "ctrlKey"),
    shiftKey: readBoolean(event, "shiftKey"),
    altKey: readBoolean(event, "altKey"),
    metaKey: readBoolean(event, "metaKey"),
    touchCount: readTouchCount(event),
  };
}

function snapshotEventTarget(target: EventTarget | null): WorkspacePanDiagnosticTarget | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const section = target.closest<HTMLElement>("[data-section-id]");
  const node = target.closest<HTMLElement>(".react-flow__node");
  return {
    tagName: target.tagName.toLowerCase(),
    id: target.id || null,
    classNames: [...target.classList],
    sectionId: section?.dataset.sectionId ?? null,
    sectionPresentation: section?.dataset.sectionPresentation ?? null,
    nodeId: node?.dataset.id ?? null,
    noPan: target.closest(`.${NO_PAN_CLASS_NAME}`) !== null,
    noWheel: target.closest(`.${NO_WHEEL_CLASS_NAME}`) !== null,
    manualWheel: target.closest(`.${MANUAL_WHEEL_CLASS_NAME}`) !== null,
    nativeVerticalWheel: target.closest(`.${NATIVE_VERTICAL_WHEEL_CLASS_NAME}`) !== null,
    insideWorkspace: target.closest(".setta-workspace") !== null,
    insideZoomRenderer: target.closest(".react-flow__renderer") !== null,
  };
}

function snapshotInteractionState(): WorkspacePanDiagnosticState {
  const canvas = useReactFlow.getState();
  const dnd = useDndState.getState();
  const options = useWorkspaceOptions.getState();
  const installedWheelHandler = canvas.d3Selection?.on("wheel.zoom");
  const canvasRoot = canvas.domNode;
  return {
    transform: [...canvas.transform],
    paneDragging: canvas.paneDragging,
    viewportInteractionActive: canvas.viewportInteractionActive,
    userSelectionActive: canvas.userSelectionActive,
    selectionKeyPressed: canvas.selectionKeyPressed,
    panActivationKeyPressed: canvas.panActivationKeyPressed,
    zoomActivationKeyPressed: canvas.zoomActivationKeyPressed,
    panOnDrag: Array.isArray(options.panOnDrag) ? [...options.panOnDrag] : options.panOnDrag,
    panOnScroll: options.panOnScroll,
    panOnScrollMode: options.panOnScrollMode,
    activeDndId: dnd.activeId,
    dndIsSorting: dnd.isSorting,
    dndIsMovingFree: dnd.isMovingFree,
    dndPendingDeactivation: dnd.pendingDeactivation,
    d3SelectionPresent: canvas.d3Selection !== null,
    d3ZoomPresent: canvas.d3Zoom !== null,
    originalWheelHandlerPresent: typeof canvas.d3ZoomHandler === "function",
    installedWheelHandlerPresent: typeof installedWheelHandler === "function",
    installedWheelHandlerIsOriginal:
      typeof installedWheelHandler === "function" && installedWheelHandler === canvas.d3ZoomHandler,
    documentHasFocus: document.hasFocus(),
    documentVisibilityState: document.visibilityState,
    canvasConnected: canvasRoot?.isConnected ?? false,
    canvasScrollLeft: canvasRoot?.scrollLeft ?? null,
    canvasScrollTop: canvasRoot?.scrollTop ?? null,
    canvasScrollWidth: canvasRoot?.scrollWidth ?? null,
    canvasScrollHeight: canvasRoot?.scrollHeight ?? null,
  };
}

function readFiniteNumber(event: Event, key: string): number | null {
  const value = Reflect.get(event, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(event: Event, key: string): boolean {
  return Reflect.get(event, key) === true;
}

function readTouchCount(event: Event): number | null {
  const touches = Reflect.get(event, "touches");
  if (typeof touches !== "object" || touches === null) {
    return null;
  }
  const length = Reflect.get(touches, "length");
  return typeof length === "number" ? length : null;
}
