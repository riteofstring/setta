import { percentile } from "./settings-retained-frame-helpers";

const PAN_ZOOM_P95_FRAME_BUDGET_MS = 8.5;
const PAN_ZOOM_CAPPED_P95_FRAME_BUDGET_MS = 20;
const CAPPED_P95_FRAME_BUDGET_SLACK_MS = 4;
const CAPPED_GESTURE_P95_FRAME_BUDGET_SLACK_MS = 4;
const STRICT_GESTURE_EVENT_P95_BUDGET_MS = 9;
const STRICT_RAF_P95_BUDGET_MS = 10;
const PAN_ZOOM_MAX_FRAME_BUDGET_MS = 60;
const PAN_ZOOM_LONG_TASK_BUDGET_MS = 60;

type PanZoomGestureCadenceSample = {
  readonly eventSpacingMs: readonly number[];
};

type PanZoomRafCadenceSample = {
  readonly maxMs: number;
  readonly p95Ms: number;
};

export function resolvePanZoomCappedP95FrameBudget({
  gesture,
  rafCadence,
}: {
  readonly gesture: PanZoomGestureCadenceSample;
  readonly rafCadence: PanZoomRafCadenceSample;
}): number {
  const gestureP95Ms = percentile(
    [...gesture.eventSpacingMs].sort((left, right) => left - right),
    0.95,
  );
  const measuredBudgetMs = Math.max(
    PAN_ZOOM_P95_FRAME_BUDGET_MS,
    rafCadence.p95Ms + CAPPED_P95_FRAME_BUDGET_SLACK_MS,
    gestureP95Ms + CAPPED_GESTURE_P95_FRAME_BUDGET_SLACK_MS,
  );
  if (
    rafCadence.p95Ms <= STRICT_RAF_P95_BUDGET_MS &&
    gestureP95Ms <= STRICT_GESTURE_EVENT_P95_BUDGET_MS
  ) {
    return measuredBudgetMs;
  }
  return Math.max(PAN_ZOOM_CAPPED_P95_FRAME_BUDGET_MS, measuredBudgetMs);
}

export function resolvePanZoomCappedLongTaskBudget({
  gesture,
  rafCadence,
}: {
  readonly gesture: PanZoomGestureCadenceSample;
  readonly rafCadence: PanZoomRafCadenceSample;
}): number {
  const gestureP95Ms = percentile(
    [...gesture.eventSpacingMs].sort((left, right) => left - right),
    0.95,
  );
  if (
    rafCadence.p95Ms <= STRICT_RAF_P95_BUDGET_MS &&
    gestureP95Ms <= STRICT_GESTURE_EVENT_P95_BUDGET_MS
  ) {
    return PAN_ZOOM_LONG_TASK_BUDGET_MS;
  }
  return Math.max(
    PAN_ZOOM_LONG_TASK_BUDGET_MS,
    rafCadence.p95Ms + CAPPED_P95_FRAME_BUDGET_SLACK_MS,
    Math.max(0, ...gesture.eventSpacingMs) +
      CAPPED_GESTURE_P95_FRAME_BUDGET_SLACK_MS,
  );
}

export function resolvePanZoomCappedMaxFrameBudget({
  gesture,
  rafCadence,
}: {
  readonly gesture: PanZoomGestureCadenceSample;
  readonly rafCadence: PanZoomRafCadenceSample;
}): number {
  return Math.max(
    PAN_ZOOM_MAX_FRAME_BUDGET_MS,
    rafCadence.maxMs + CAPPED_P95_FRAME_BUDGET_SLACK_MS,
    Math.max(0, ...gesture.eventSpacingMs) +
      CAPPED_GESTURE_P95_FRAME_BUDGET_SLACK_MS,
  );
}
