import type { AppShellMasterSnapshot, MasterInteractionState } from "./app-shell-master-controller";

export type MasterPaneViewState = "complete" | "idle" | "working";
export type MasterPaneStatusTone = "completed" | "failed" | "none" | "stopped";

export function masterPaneViewState(snapshot: AppShellMasterSnapshot): MasterPaneViewState {
  if (masterPaneHasWorkingActivity(snapshot)) {
    return "working";
  }
  if (masterPaneHasCompletedActivity(snapshot)) {
    return "complete";
  }
  return "idle";
}

export function masterPaneStatusTone(snapshot: AppShellMasterSnapshot): MasterPaneStatusTone {
  const interactionTone = masterInteractionStatusTone(snapshot.interaction);
  if (
    snapshot.submission.type === "failed" ||
    snapshot.cancellation.type === "failed" ||
    interactionTone === "failed"
  ) {
    return "failed";
  }
  return interactionTone;
}

function masterPaneHasWorkingActivity(snapshot: AppShellMasterSnapshot): boolean {
  return (
    snapshot.submission.type === "submitting" ||
    snapshot.cancellation.type === "cancelling" ||
    interactionIsWorking(snapshot.interaction)
  );
}

function masterPaneHasCompletedActivity(snapshot: AppShellMasterSnapshot): boolean {
  return (
    snapshot.submission.type === "accepted" ||
    snapshot.submission.type === "failed" ||
    snapshot.cancellation.type === "failed" ||
    masterInteractionStatusTone(snapshot.interaction) !== "none"
  );
}

function masterInteractionStatusTone(interaction: MasterInteractionState): MasterPaneStatusTone {
  switch (interaction.type) {
    case "active":
      return activeInteractionStatusTone(interaction.state.status);
    case "load_failed":
    case "observation_failed":
      return "failed";
    case "disconnected":
    case "idle":
    case "loading":
      return "none";
    default:
      return assertNever(interaction);
  }
}

function activeInteractionStatusTone(
  status: MasterInteractionState & { type: "active" } extends { state: infer State }
    ? State extends { status: infer Status }
      ? Status
      : never
    : never,
): MasterPaneStatusTone {
  switch (status) {
    case "decided":
      return "completed";
    case "cancelled":
      return "stopped";
    case "failed":
      return "failed";
    case "accepted":
    case "routing":
      return "none";
    default:
      return assertNever(status);
  }
}

function interactionIsWorking(interaction: MasterInteractionState): boolean {
  return (
    interaction.type === "loading" ||
    (interaction.type === "active" &&
      (interaction.state.status === "accepted" || interaction.state.status === "routing"))
  );
}

function assertNever(value: never): never {
  throw new Error(`Unsupported master pane state: ${JSON.stringify(value)}`);
}
