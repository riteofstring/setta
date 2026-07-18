import type { Run, RunLiveness } from "@generated/backend";

type ActiveRunPresentationKind = "idle" | "working" | "blocked" | "reconnecting" | "lost";
export type RunLivenessPresentationKind = "working" | "reconnecting" | "lost" | "terminal";

export interface ActiveRunPresentation {
  canRetry: boolean;
  canSteer: boolean;
  canStop: boolean;
  kind: ActiveRunPresentationKind;
  liveness: RunLiveness | null;
  running: boolean;
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
      kind: "reconnecting",
      running: true,
    };
  }
  return activeRunLivenessPresentation(activeRun, matched, capabilities);
}

function activeRunLivenessPresentation(
  activeRun: Run,
  liveness: RunLiveness,
  capabilities: ActiveRunControlCapabilities,
): ActiveRunPresentation {
  const connectionKind = runLivenessPresentationKind(liveness);
  switch (connectionKind) {
    case "working":
      return workingRunPresentation(activeRun, liveness, capabilities);
    case "reconnecting":
      return reconnectingRunPresentation(liveness, capabilities);
    case "lost":
      return lostRunPresentation(liveness, capabilities);
    case "terminal":
      return idlePresentation;
    default:
      return assertNever(connectionKind);
  }
}

function workingRunPresentation(
  activeRun: Run,
  liveness: RunLiveness,
  capabilities: ActiveRunControlCapabilities,
): ActiveRunPresentation {
  if (activeRun.pendingApproval !== null || liveness.phase === "blocked") {
    return {
      canRetry: false,
      canSteer: false,
      canStop: capabilities.stopRun && liveness.cancellable,
      kind: "blocked",
      liveness,
      running: true,
    };
  }
  return {
    canRetry: false,
    canSteer: capabilities.sendSteering && liveness.steerable,
    canStop: capabilities.stopRun && liveness.cancellable,
    kind: "working",
    liveness,
    running: true,
  };
}

function reconnectingRunPresentation(
  liveness: RunLiveness,
  capabilities: ActiveRunControlCapabilities,
): ActiveRunPresentation {
  return {
    canRetry: capabilities.retryLiveness && liveness.retryable,
    canSteer: false,
    canStop: capabilities.stopRun && liveness.cancellable,
    kind: "reconnecting",
    liveness,
    running: true,
  };
}

function lostRunPresentation(
  liveness: RunLiveness,
  capabilities: ActiveRunControlCapabilities,
): ActiveRunPresentation {
  return {
    canRetry: capabilities.retryLiveness && liveness.retryable,
    canSteer: false,
    canStop: capabilities.stopRun && liveness.cancellable,
    kind: "lost",
    liveness,
    running: true,
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
  return liveness.phase === "lost";
}

export function runLivenessPresentationKind(liveness: RunLiveness): RunLivenessPresentationKind {
  switch (liveness.phase) {
    case "attached":
    case "blocked":
      return "working";
    case "lost":
      return "lost";
    case "terminal":
      return "terminal";
    case "starting":
    case "waiting_for_provider":
    case "stalled":
    case "reconnecting":
      return "reconnecting";
    default:
      return assertNever(liveness.phase);
  }
}

export function runLivenessPresentationLabel(kind: RunLivenessPresentationKind): string {
  switch (kind) {
    case "working":
      return "Working";
    case "reconnecting":
      return "Reconnecting";
    case "lost":
      return "Connection lost";
    case "terminal":
      return "Finished";
    default:
      return assertNever(kind);
  }
}

const idlePresentation = {
  canRetry: false,
  canSteer: false,
  canStop: false,
  kind: "idle",
  liveness: null,
  running: false,
} satisfies ActiveRunPresentation;

const defaultActiveRunControlCapabilities = {
  retryLiveness: true,
  sendSteering: true,
  stopRun: true,
} satisfies ActiveRunControlCapabilities;

function assertNever(value: never): never {
  throw new Error(`Unhandled run liveness status: ${JSON.stringify(value)}`);
}
