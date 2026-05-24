import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type {
  BrowserVisualActor,
  BrowserVisualActorCoverageState,
  BrowserVisualActorNonemptyReason,
  BrowserVisualActorRepresentationReadiness,
  BrowserVisualActorVisibilityReason,
} from "./browserVisualActorAdapter";
import type { BrowserVisualActorCompatiblePreviousProof } from "./browserVisualActorProofTypes";
import { requiresLiveDomControlTextActorRepresentation } from "./browserVisualActorRepresentation";

const DOM_CONTROL_COMPATIBLE_PREVIOUS_READINESS_STATES = new Set<
  BrowserVisualActorRepresentationReadiness["coverageState"]
>([
  "blocked-awaiting-live-host",
  "blocked-awaiting-snapshot",
  "compatible-previous-ready",
]);

const DOM_CONTROL_REQUIRED_REASON_BY_NONEMPTY_REASON = {
  "active-editor": "active-editor",
  "native-control-affordance": "native-control-affordance",
  "placeholder-text": "native-control-affordance",
  "selection-caret": "selection-caret",
  "semantic-required-visible": "semantic-required-visible",
  "value-text": "value-text",
} satisfies Record<
  BrowserVisualActorNonemptyReason,
  BrowserVisualActor["coverageRequired"]["reason"]
>;

export function getDomControlVisibilityReason({
  control,
  representationReadiness,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
}): BrowserVisualActorVisibilityReason {
  if (control.visualPolicy === "blocked-awaiting-browser-visual") {
    return "blocked";
  }
  if (
    representationReadiness?.projectionCoverageRequired === true &&
    control.projectionVisibility !== "clipped-empty"
  ) {
    return "visible";
  }
  switch (control.projectionVisibility) {
    case "viewport-visible":
      return "visible";
    case "overscan-visible":
    case "outside-viewport":
      return "outside-viewport";
    case "clipped-empty":
      return "clipped-empty";
  }
}

export function getDomControlNonemptyReason(
  control: GpuRetainedDomControlSourceDescriptor,
): BrowserVisualActorNonemptyReason {
  if (control.active) {
    return "active-editor";
  }
  if (requiresLiveDomControlTextActorRepresentation(control)) {
    return "selection-caret";
  }
  if (control.value.length > 0) {
    return "value-text";
  }
  if (control.snapshotCacheKey.placeholder.length > 0) {
    return "placeholder-text";
  }
  return "native-control-affordance";
}

export function getDomControlCoverageRequired({
  control,
  nonemptyReason,
  representationReadiness,
  visibilityReason,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly nonemptyReason: BrowserVisualActorNonemptyReason;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
  readonly visibilityReason: BrowserVisualActorVisibilityReason;
}): BrowserVisualActor["coverageRequired"] {
  if (hasCoverageExemptReadiness(representationReadiness)) {
    return { reason: "none", required: false };
  }
  if (
    !isDomControlCoverageRequiredForVisibility({ control, visibilityReason })
  ) {
    return { reason: "none", required: false };
  }
  return {
    reason: DOM_CONTROL_REQUIRED_REASON_BY_NONEMPTY_REASON[nonemptyReason],
    required: true,
  };
}

export function getDomControlCoverageExemption(
  visibilityReason: BrowserVisualActorVisibilityReason,
): BrowserVisualActor["coverageExemption"] {
  switch (visibilityReason) {
    case "clipped-empty":
      return { reason: "clipped-empty" };
    case "outside-viewport":
      return { reason: "outside-viewport" };
    case "hidden-by-policy":
      return { reason: "hidden-by-policy" };
    case "blocked":
    case "visible":
      return null;
  }
}

export function getDomControlCoverageState({
  compatiblePreviousProof,
  control,
  coverageRequired,
  representationReadiness,
}: {
  readonly compatiblePreviousProof: BrowserVisualActorCompatiblePreviousProof | null;
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageRequired: boolean;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
}): BrowserVisualActorCoverageState {
  if (!coverageRequired) {
    return "coverage-exempt";
  }
  if (
    compatiblePreviousProof &&
    canUseDomControlCompatiblePreviousCoverage(control, representationReadiness)
  ) {
    return "compatible-previous-ready";
  }
  return getDomControlCoverageStateForVisualPolicy({
    control,
    representationReadiness,
  });
}

function getDomControlCoverageStateForVisualPolicy({
  control,
  representationReadiness,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly representationReadiness: BrowserVisualActorRepresentationReadiness | null;
}): BrowserVisualActorCoverageState {
  const readinessState = representationReadiness?.coverageState;
  if (requiresLiveDomControlTextActorRepresentation(control)) {
    return readinessState === "live-host-ready"
      ? "live-host-ready"
      : "blocked-awaiting-live-host";
  }
  switch (control.visualPolicy) {
    case "live-dom":
    case "outside-viewport":
      return getLiveDomControlCoverageState(readinessState);
    case "snapshot":
      return getSnapshotDomControlCoverageState(readinessState);
    case "blocked-awaiting-browser-visual":
      return getBlockedDomControlCoverageState(readinessState);
    case "clipped-empty":
      return "true-hole";
  }
}

function hasCoverageExemptReadiness(
  representationReadiness: BrowserVisualActorRepresentationReadiness | null,
): boolean {
  return (
    representationReadiness?.coverageState === "coverage-exempt" &&
    representationReadiness.projectionCoverageRequired !== true
  );
}

function isDomControlCoverageRequiredForVisibility({
  control,
  visibilityReason,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly visibilityReason: BrowserVisualActorVisibilityReason;
}): boolean {
  return (
    control.active ||
    visibilityReason === "visible" ||
    visibilityReason === "blocked"
  );
}

function getLiveDomControlCoverageState(
  readinessState:
    | BrowserVisualActorRepresentationReadiness["coverageState"]
    | undefined,
): BrowserVisualActorCoverageState {
  if (readinessState === "exact-snapshot-ready") {
    return "exact-snapshot-ready";
  }
  if (readinessState === "blocked-awaiting-snapshot") {
    return "blocked-awaiting-snapshot";
  }
  return readinessState === "live-host-ready"
    ? "live-host-ready"
    : "blocked-awaiting-live-host";
}

function getSnapshotDomControlCoverageState(
  readinessState:
    | BrowserVisualActorRepresentationReadiness["coverageState"]
    | undefined,
): BrowserVisualActorCoverageState {
  if (readinessState === "live-host-ready") {
    return "live-host-ready";
  }
  return readinessState === "exact-snapshot-ready"
    ? "exact-snapshot-ready"
    : "blocked-awaiting-snapshot";
}

function getBlockedDomControlCoverageState(
  readinessState:
    | BrowserVisualActorRepresentationReadiness["coverageState"]
    | undefined,
): BrowserVisualActorCoverageState {
  if (readinessState === "live-host-ready") {
    return "live-host-ready";
  }
  if (readinessState === "exact-snapshot-ready") {
    return "exact-snapshot-ready";
  }
  return "blocked-awaiting-snapshot";
}

function canUseDomControlCompatiblePreviousCoverage(
  control: GpuRetainedDomControlSourceDescriptor,
  representationReadiness: BrowserVisualActorRepresentationReadiness | null,
): boolean {
  if (requiresLiveDomControlTextActorRepresentation(control)) {
    return false;
  }
  if (control.visualPolicy === "blocked-awaiting-browser-visual") {
    return true;
  }
  if (control.visualPolicy === "snapshot" && !control.snapshotSurfaceId) {
    return true;
  }
  return DOM_CONTROL_COMPATIBLE_PREVIOUS_READINESS_STATES.has(
    representationReadiness?.coverageState ?? "coverage-exempt",
  );
}
