export const recordingRendererEventChannel = "recording:renderer-event";

export type RendererRecordedEvent =
  | RendererClickEvent
  | RendererChatUISnapshotEvent
  | RendererKeydownEvent
  | RendererSubmitEvent
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

interface RendererChatUISnapshotEvent extends RendererRecordedEventBase {
  activeElementKey: string;
  activeRunStatus: string;
  appeared: string[];
  disappeared: string[];
  elementCount: number;
  elements: RendererChatUIElement[];
  selectedConversationId: string;
  transcript: RendererScrollRect | null;
  trigger: string;
  type: "chat_ui_snapshot";
  updated: string[];
  viewport: {
    height: number;
    width: number;
  };
  visibleElementCount: number;
  workspaceId: string;
}

interface RendererChatUIElement {
  key: string;
  kind: string;
  rect: RendererRect | null;
  state: Record<string, string | number | boolean | null>;
  textHash: string;
  textLength: number;
  textPreview: string;
  textTruncated: boolean;
  visible: boolean;
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
