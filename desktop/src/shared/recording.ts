export const recordingRendererEventChannel = "recording:renderer-event";

export type RendererRecordedEvent =
  | RendererClickEvent
  | RendererKeydownEvent
  | RendererSubmitEvent
  | RendererErrorEvent
  | RendererLayoutSnapshotEvent
  | RendererUnhandledRejectionEvent
  | TerminalLatencyRendererEvent;

export type TerminalLatencyRendererEvent =
  | TerminalInputRendererReceivedEvent
  | TerminalOutputRendererReceivedEvent
  | TerminalOutputXtermWriteEvent
  | TerminalOutputPaintedEvent;

interface RendererRecordedEventBase {
  at: string;
  target?: RendererTargetSummary;
  type: string;
  url: string;
}

interface RendererTargetSummary {
  ariaLabel: string;
  classes: string;
  id: string;
  name: string;
  role: string;
  tag: string;
  text: string;
  type: string;
}

interface RendererClickEvent extends RendererRecordedEventBase {
  button: number;
  type: "click";
}

interface RendererKeydownEvent extends RendererRecordedEventBase {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  type: "keydown";
}

interface RendererSubmitEvent extends RendererRecordedEventBase {
  type: "submit";
}

interface RendererErrorEvent extends RendererRecordedEventBase {
  message: string;
  source: string;
  type: "error";
}

interface RendererUnhandledRejectionEvent extends RendererRecordedEventBase {
  reason: string;
  type: "unhandledrejection";
}

interface TerminalLatencyEventBase extends RendererRecordedEventBase {
  byteCount: number;
  clientId: string;
  runId: string;
  sessionId: string;
}

interface TerminalInputRendererReceivedEvent extends TerminalLatencyEventBase {
  inputSequence: number;
  type: "terminal_input_renderer_received";
}

interface TerminalOutputEventBase extends TerminalLatencyEventBase {
  emittedAt: string;
  eventId: string;
  transportSequence: number;
}

interface TerminalOutputRendererReceivedEvent extends TerminalOutputEventBase {
  type: "terminal_output_renderer_received";
}

interface TerminalOutputXtermWriteEvent extends TerminalOutputEventBase {
  type: "terminal_output_xterm_write";
}

interface TerminalOutputPaintedEvent extends TerminalOutputEventBase {
  type: "terminal_output_painted";
}

interface RendererLayoutSnapshotEvent extends RendererRecordedEventBase {
  activeRunStatus: string;
  backgroundTerminalSurface: RendererBackgroundTerminalSurfaceSnapshot;
  chatDetailPane: RendererRect | null;
  composer: RendererRect | null;
  jumpToLatestButton: RendererVisibleRect | null;
  queueSize: number;
  selectedConversationId: string;
  transcript: RendererScrollRect | null;
  transcriptScrollDebug: RendererTranscriptScrollDebugSnapshot | null;
  trigger: string;
  type: "layout_snapshot";
  viewport: {
    height: number;
    width: number;
  };
  visibleTurnIds: string[];
}

interface RendererBackgroundTerminalSurfaceSnapshot {
  footerPhase: string;
  footerVisible: boolean;
  monitorOpen: boolean;
  visibleTerminalIds: string[];
  visibleTerminalStatuses: string[];
}

interface RendererRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface RendererScrollRect extends RendererRect {
  clientHeight: number;
  distanceFromBottom: number;
  scrollTop: number;
  scrollHeight: number;
}

interface RendererVisibleRect extends RendererRect {
  visible: boolean;
}

interface RendererTranscriptScrollDebugTraceEntry {
  [key: string]: boolean | number | string | null;
}

type RendererTranscriptScrollDebugSnapshot =
  | {
      awayFromBottom: boolean;
      atBottom: boolean;
      clientHeight: number;
      distanceFromBottom: number;
      hasScrollableOverflow: boolean;
      lastVisibleIndex: number;
      mode: string;
      pendingScrollCount: number;
      programmaticScrollCount: number;
      rowCount: number;
      scrollHeight: number;
      source: string;
      scrollTop: number;
      tailRevision: string;
      trace: RendererTranscriptScrollDebugTraceEntry[];
    }
  | {
      error: string;
      source: string;
    };
