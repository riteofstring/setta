import type { Run, RunActiveStatusKind, RunLiveness } from "@generated/backend";

type ActiveRunPresentationKind = "idle" | RunActiveStatusKind;
export type RunLivenessPresentationKind = RunActiveStatusKind;

export interface ActiveRunPresentation {
  canRetry: boolean;
  canSteer: boolean;
  canStop: boolean;
  detail: string;
  headline: string;
  kind: ActiveRunPresentationKind;
  liveness: RunLiveness | null;
  running: boolean;
  steeringDisabledReason: string;
}

export interface ActiveRunControlCapabilities {
  retryLiveness: boolean;
  sendSteering: boolean;
  stopRun: boolean;
}

export function activeRunPresentation(
  activeRun: Run | null,
  liveness: RunLiveness | null,
  capabilities: ActiveRunControlCapabilities = defaultActiveRunControlCapabilities,
): ActiveRunPresentation {
  if (activeRun?.status !== "running") {
    return idlePresentation;
  }
  const matched = matchingRunLiveness(activeRun, liveness);
  if (!matched) {
    return {
      ...idlePresentation,
      detail: "",
      headline: "Checking Codex",
      kind: "reconnecting",
      running: true,
      steeringDisabledReason: "Setta is checking the provider turn.",
    };
  }
  return activeRunLivenessPresentation(matched, capabilities);
}

function activeRunLivenessPresentation(
  liveness: RunLiveness,
  capabilities: ActiveRunControlCapabilities,
): ActiveRunPresentation {
  return {
    canRetry: capabilities.retryLiveness && liveness.retryable,
    canSteer: capabilities.sendSteering && liveness.steerable,
    canStop: capabilities.stopRun && liveness.cancellable,
    detail: liveness.activeStatus.detail,
    headline: liveness.activeStatus.headline,
    kind: liveness.activeStatus.kind,
    liveness,
    running: true,
    steeringDisabledReason: liveness.steeringDisabledReason,
  };
}

function matchingRunLiveness(
  activeRun: Run | null,
  liveness: RunLiveness | null,
): RunLiveness | null {
  if (
    activeRun === null ||
    liveness === null ||
    liveness.workspaceId !== activeRun.workspaceId ||
    liveness.conversationId !== activeRun.conversationId ||
    liveness.runId !== activeRun.id
  ) {
    return null;
  }
  return liveness;
}

export function runLivenessNeedsSnapshotResync(liveness: RunLiveness): boolean {
  return liveness.status === "lost";
}

export function runLivenessPresentationKind(liveness: RunLiveness): RunLivenessPresentationKind {
  return liveness.activeStatus.kind;
}

const idlePresentation = {
  canRetry: false,
  canSteer: false,
  canStop: false,
  detail: "",
  headline: "",
  kind: "idle",
  liveness: null,
  running: false,
  steeringDisabledReason: "",
} satisfies ActiveRunPresentation;

const defaultActiveRunControlCapabilities = {
  retryLiveness: true,
  sendSteering: true,
  stopRun: true,
} satisfies ActiveRunControlCapabilities;
