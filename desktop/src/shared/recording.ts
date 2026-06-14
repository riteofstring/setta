export const recordingRendererEventChannel = "recording:renderer-event";
export const recordingCartographerAuditSnapshotEventName =
  "setta:record-cartographer-audit-snapshot";

export type RendererRecordedEvent =
  | RendererClickEvent
  | RendererKeydownEvent
  | RendererSubmitEvent
  | RendererCartographerAuditSnapshotEvent
  | RendererErrorEvent
  | RendererLayoutSnapshotEvent
  | RendererUnhandledRejectionEvent;

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

interface RendererCartographerAuditSnapshotEvent extends RendererRecordedEventBase {
  snapshot: unknown;
  trigger: string;
  type: "cartographer_audit_snapshot";
  workspaceId: string;
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

interface RendererLayoutSnapshotEvent extends RendererRecordedEventBase {
  activeRunStatus: string;
  chatDetailPane: RendererRect | null;
  composer: RendererRect | null;
  queueSize: number;
  selectedConversationId: string;
  transcript: RendererScrollRect | null;
  trigger: string;
  type: "layout_snapshot";
  viewport: {
    height: number;
    width: number;
  };
  visibleTurnIds: string[];
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
  scrollHeight: number;
}
