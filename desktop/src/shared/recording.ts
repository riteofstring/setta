export const recordingRendererEventChannel = "recording:renderer-event";
export const recordingCartographerAuditSnapshotEventName =
  "setta:record-cartographer-audit-snapshot";
export const recordingWorkspaceGraphPerformanceEventName =
  "setta:record-workspace-graph-performance";

export type RendererRecordedEvent =
  | RendererClickEvent
  | RendererKeydownEvent
  | RendererSubmitEvent
  | RendererCartographerAuditSnapshotEvent
  | RendererWorkspaceGraphPerformanceEvent
  | RendererLongTaskEvent
  | RendererEventTimingEvent
  | RendererAnimationFrameGapEvent
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

interface RendererWorkspaceGraphPerformanceEvent extends RendererRecordedEventBase {
  reason: string;
  sample: unknown;
  surfaceId: string;
  type: "workspace_graph_performance";
}

interface RendererLongTaskEvent extends RendererRecordedEventBase {
  attribution: RendererLongTaskAttribution[];
  durationMs: number;
  entryType: string;
  name: string;
  startTimeMs: number;
  type: "renderer_long_task";
}

interface RendererLongTaskAttribution {
  containerId: string;
  containerName: string;
  containerSrc: string;
  containerType: string;
  name: string;
}

interface RendererEventTimingEvent extends RendererRecordedEventBase {
  cancelable: boolean;
  durationMs: number;
  entryType: string;
  eventTarget?: RendererTargetSummary;
  interactionId: number | null;
  inputDelayMs: number | null;
  name: string;
  processingDurationMs: number | null;
  processingEndMs: number | null;
  processingStartMs: number | null;
  startTimeMs: number;
  type: "renderer_event_timing";
}

interface RendererAnimationFrameGapEvent extends RendererRecordedEventBase {
  frameAtMs: number;
  frameGapMs: number;
  previousFrameAtMs: number;
  thresholdMs: number;
  type: "renderer_animation_frame_gap";
  visibilityState: string;
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
  mutationSummary?: RendererMutationSummary;
  type: "layout_snapshot";
  viewport: {
    height: number;
    width: number;
  };
  visibleTurnIds: string[];
}

interface RendererMutationSummary {
  addedNodes: RendererTargetSummary[];
  attributeCount: number;
  attributeNames: string[];
  characterDataCount: number;
  childListCount: number;
  recordCount: number;
  removedNodes: RendererTargetSummary[];
  targetCount: number;
  targets: RendererTargetSummary[];
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
