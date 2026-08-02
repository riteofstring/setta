export const recordingRendererEventChannel = "recording:renderer-event";

export type RendererRecordedEvent =
  | RendererClickEvent
  | RendererKeydownEvent
  | RendererPointerEvent
  | RendererSubmitEvent
  | RendererErrorEvent
  | RendererInteractionLatencyEvent
  | RendererLayoutSnapshotEvent
  | RendererLongTaskEvent
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
  clientX: number;
  clientY: number;
  hitTargets: RendererTargetSummary[];
  type: "click";
}

interface RendererPointerEvent extends RendererRecordedEventBase {
  button: number;
  clientX: number;
  clientY: number;
  hitTargets: RendererTargetSummary[];
  pointerId: number;
  pointerType: string;
  type: "pointerdown" | "pointerup";
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

/**
 * One interaction, split into the three intervals that make it feel slow.
 *
 * From the Event Timing API, which is the browser's own account of an
 * interaction rather than an approximation built from listeners: `delayMs` is
 * how long the event waited before any handler ran (the main thread was busy),
 * `processingMs` is the handlers themselves, and `durationMs` runs from the
 * input to the next paint that shows its result. `durationMs` is the number a
 * user would call lag.
 *
 * Recorded only past a threshold, so an ordinary keystroke costs nothing.
 */
interface RendererInteractionLatencyEvent extends RendererRecordedEventBase {
  delayMs: number;
  durationMs: number;
  /** Groups the keydown/keyup/input of one keypress; 0 when the browser gave none. */
  interactionId: number;
  name: string;
  processingMs: number;
  type: "interaction_latency";
}

/**
 * A task that occupied the main thread long enough to block a frame. Paired
 * with an interaction of the same moment, this says what the thread was doing
 * instead of responding.
 */
interface RendererLongTaskEvent extends RendererRecordedEventBase {
  attribution: string;
  durationMs: number;
  startedAtMs: number;
  type: "long_task";
}

interface RendererLayoutSnapshotEvent extends RendererRecordedEventBase {
  trigger: string;
  type: "layout_snapshot";
  viewport: {
    height: number;
    width: number;
  };
}
