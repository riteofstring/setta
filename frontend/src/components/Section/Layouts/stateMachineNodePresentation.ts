import { getLatestStateMachineRun } from "state/actions/stateMachineRuns";
import {
  RunStatusEnum,
  SectionTypeEnum,
  type AgentRun,
} from "utils/generatedTypes";

type StateMachineActivityTone = "default" | "success" | "warning" | "danger";

type StateMachineActivityItem = {
  id: string;
  label: string;
  tone: StateMachineActivityTone;
};

type StateMachineGateStatusPresentation = {
  label: string;
  classes: string;
} | null;

type StateMachineGateInputProgressPresentation = {
  label: string;
  classes: string;
} | null;

type StateMachineRunPresentation = {
  statusLabel: string;
  statusClasses: string;
  isRunning: boolean;
  hasRun: boolean;
  gateStatus: StateMachineGateStatusPresentation;
  gateInputProgress: StateMachineGateInputProgressPresentation;
  failureSummaryLabel: string | null;
  activityItems: StateMachineActivityItem[];
};

type StateMachineNodePresentationArgs = {
  runs: AgentRun[];
  projectConfigId: string;
  machineGroupId: string;
  sectionId: string;
  sectionType:
    | SectionTypeEnum.StateMachineStart
    | SectionTypeEnum.StateMachineGate
    | SectionTypeEnum.StateMachineEnd;
};

type AgentRunEvent = AgentRun["events"][number];

const DEFAULT_ACTIVITY_ITEM_LIMIT = 3;

export function getStateMachineNodePresentation({
  runs,
  projectConfigId,
  machineGroupId,
  sectionId,
  sectionType,
}: StateMachineNodePresentationArgs): StateMachineRunPresentation {
  const latestRun = getLatestStateMachineRun(
    runs,
    projectConfigId,
    machineGroupId,
  );
  const basePresentation = getMachineRunPresentation(latestRun);
  return {
    ...basePresentation,
    gateStatus:
      sectionType === SectionTypeEnum.StateMachineGate
        ? getGateStatusPresentation(latestRun, sectionId)
        : null,
    gateInputProgress:
      sectionType === SectionTypeEnum.StateMachineGate
        ? getGateInputProgressPresentation(latestRun, sectionId)
        : null,
    failureSummaryLabel: getFailureSummaryLabel(latestRun),
    activityItems: getRecentActivityItems({
      latestRun,
      sectionId,
      sectionType,
    }),
  };
}

function getMachineRunPresentation(run: AgentRun | null): {
  statusLabel: string;
  statusClasses: string;
  isRunning: boolean;
  hasRun: boolean;
} {
  if (!run) {
    return {
      statusLabel: "Idle",
      statusClasses:
        "border-slate-300/70 bg-white/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200",
      isRunning: false,
      hasRun: false,
    };
  }
  if (run.status === RunStatusEnum.running) {
    return {
      statusLabel: "Running",
      statusClasses:
        "border-emerald-400/70 bg-emerald-500/10 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
      isRunning: true,
      hasRun: true,
    };
  }
  if (run.status === RunStatusEnum.completed) {
    return {
      statusLabel: "Completed",
      statusClasses:
        "border-sky-400/70 bg-sky-500/10 text-sky-800 dark:border-sky-700 dark:bg-sky-500/15 dark:text-sky-200",
      isRunning: false,
      hasRun: true,
    };
  }
  if (run.status === RunStatusEnum.failed) {
    return {
      statusLabel: "Failed",
      statusClasses:
        "border-rose-400/70 bg-rose-500/10 text-rose-800 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
      isRunning: false,
      hasRun: true,
    };
  }
  return {
    statusLabel: "Stopped",
    statusClasses:
      "border-amber-400/70 bg-amber-500/10 text-amber-800 dark:border-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
    isRunning: false,
    hasRun: true,
  };
}

function getGateStatusPresentation(
  run: AgentRun | null,
  sectionId: string,
): StateMachineGateStatusPresentation {
  const rawGateStatus = getGateStatus(run, sectionId);
  if (rawGateStatus === "waiting") {
    return {
      label: "Waiting",
      classes:
        "border-amber-400/70 bg-amber-500/10 text-amber-800 dark:border-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
    };
  }
  if (rawGateStatus === "satisfied") {
    return {
      label: "Satisfied",
      classes:
        "border-emerald-400/70 bg-emerald-500/10 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
    };
  }
  if (rawGateStatus === "blocked") {
    return {
      label: "Blocked",
      classes:
        "border-rose-400/70 bg-rose-500/10 text-rose-800 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
    };
  }
  return null;
}

function getGateInputProgressPresentation(
  run: AgentRun | null,
  sectionId: string,
): StateMachineGateInputProgressPresentation {
  const outputs = getRunOutputs(run);
  if (outputs === null) {
    return null;
  }
  const rawIncomingEdgesBySectionId = outputs.gateIncomingEdgeIdsBySectionId;
  if (
    rawIncomingEdgesBySectionId === null ||
    typeof rawIncomingEdgesBySectionId !== "object" ||
    Array.isArray(rawIncomingEdgesBySectionId)
  ) {
    return null;
  }
  const rawIncomingEdges = rawIncomingEdgesBySectionId[sectionId];
  if (!Array.isArray(rawIncomingEdges)) {
    return null;
  }
  const totalCount = rawIncomingEdges.filter(
    (edgeId): edgeId is string => typeof edgeId === "string",
  ).length;
  if (totalCount === 0) {
    return null;
  }
  const rawActivatedEdgesBySectionId = outputs.gateInputEdgeIdsBySectionId;
  let receivedCount = 0;
  if (
    rawActivatedEdgesBySectionId !== null &&
    typeof rawActivatedEdgesBySectionId === "object" &&
    !Array.isArray(rawActivatedEdgesBySectionId)
  ) {
    const rawActivatedEdges = rawActivatedEdgesBySectionId[sectionId];
    if (Array.isArray(rawActivatedEdges)) {
      receivedCount = rawActivatedEdges.filter(
        (edgeId): edgeId is string => typeof edgeId === "string",
      ).length;
    }
  }
  const rawGateStatus = getGateStatus(run, sectionId);
  let classes =
    "border-amber-400/70 bg-amber-500/10 text-amber-800 dark:border-amber-700 dark:bg-amber-500/15 dark:text-amber-200";
  if (rawGateStatus === "blocked") {
    classes =
      "border-rose-400/70 bg-rose-500/10 text-rose-800 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200";
  } else if (receivedCount >= totalCount) {
    classes =
      "border-emerald-400/70 bg-emerald-500/10 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200";
  }
  return {
    label: `${receivedCount} / ${totalCount}`,
    classes,
  };
}

function getGateStatus(
  run: AgentRun | null,
  sectionId: string,
): "waiting" | "satisfied" | "blocked" | null {
  const outputs = getRunOutputs(run);
  if (outputs === null) {
    return null;
  }
  const rawGateStatuses = outputs.gateStatusBySectionId;
  if (
    rawGateStatuses === null ||
    typeof rawGateStatuses !== "object" ||
    Array.isArray(rawGateStatuses)
  ) {
    return null;
  }
  const rawGateStatus = rawGateStatuses[sectionId];
  if (
    rawGateStatus === "waiting" ||
    rawGateStatus === "satisfied" ||
    rawGateStatus === "blocked"
  ) {
    return rawGateStatus;
  }
  return null;
}

function getFailureSummaryLabel(run: AgentRun | null): string | null {
  const outputs = getRunOutputs(run);
  if (outputs === null) {
    return null;
  }
  const rawFailureSummary = outputs.failureSummary;
  if (
    rawFailureSummary === null ||
    typeof rawFailureSummary !== "object" ||
    Array.isArray(rawFailureSummary)
  ) {
    return null;
  }
  const rawMessage = rawFailureSummary.message;
  if (typeof rawMessage !== "string" || rawMessage.trim() === "") {
    return null;
  }
  return rawMessage;
}

function getRecentActivityItems({
  latestRun,
  sectionId,
  sectionType,
}: {
  latestRun: AgentRun | null;
  sectionId: string;
  sectionType: StateMachineNodePresentationArgs["sectionType"];
}): StateMachineActivityItem[] {
  if (latestRun === null) {
    return [];
  }
  const failureSummaryLabel = getFailureSummaryLabel(latestRun);
  const events = Array.isArray(latestRun.events) ? latestRun.events : [];
  const activityItems: StateMachineActivityItem[] = [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const activityItem =
      sectionType === SectionTypeEnum.StateMachineGate
        ? getGateActivityItem(event, sectionId)
        : getMachineActivityItem(event);
    if (activityItem === null) {
      continue;
    }
    activityItems.push(activityItem);
    if (activityItems.length === DEFAULT_ACTIVITY_ITEM_LIMIT) {
      break;
    }
  }
  if (
    failureSummaryLabel !== null &&
    !activityItems.some((item) => item.label === failureSummaryLabel)
  ) {
    activityItems.unshift({
      id: `failure-summary-${latestRun.id}`,
      label: failureSummaryLabel,
      tone: "danger",
    });
  }
  return activityItems.slice(0, DEFAULT_ACTIVITY_ITEM_LIMIT);
}

function getGateActivityItem(
  event: AgentRunEvent,
  sectionId: string,
): StateMachineActivityItem | null {
  const gateSectionId = getPayloadString(event.payload, "gateSectionId");
  if (gateSectionId !== sectionId) {
    return null;
  }
  if (event.type === "gate_input_activated") {
    return {
      id: event.id,
      label: "Input received",
      tone: "default",
    };
  }
  if (event.type === "gate_satisfied") {
    return {
      id: event.id,
      label: "Gate satisfied",
      tone: "success",
    };
  }
  if (event.type === "gate_blocked") {
    return {
      id: event.id,
      label: "Gate blocked",
      tone: "danger",
    };
  }
  return null;
}

function getMachineActivityItem(
  event: AgentRunEvent,
): StateMachineActivityItem | null {
  if (event.type === "run_started") {
    return {
      id: event.id,
      label: "Workflow started",
      tone: "default",
    };
  }
  if (event.type === "start_edge_actions_dispatched") {
    const actionCount = getPayloadArrayLength(event.payload, "actions");
    if (actionCount === null) {
      return {
        id: event.id,
        label: "Start actions dispatched",
        tone: "default",
      };
    }
    return {
      id: event.id,
      label: `Dispatched ${actionCount} start ${pluralize(actionCount, "action")}`,
      tone: "default",
    };
  }
  if (event.type === "start_edge_action_dispatched") {
    return {
      id: event.id,
      label: "Start prompt dispatched",
      tone: "default",
    };
  }
  if (event.type === "start_edge_action_reset") {
    return {
      id: event.id,
      label: "Start thread reset",
      tone: "default",
    };
  }
  if (event.type === "edge_action_dispatched") {
    return {
      id: event.id,
      label: "Prompt dispatched",
      tone: "default",
    };
  }
  if (event.type === "edge_action_reset") {
    return {
      id: event.id,
      label: "Thread reset",
      tone: "default",
    };
  }
  if (event.type === "signal_reported") {
    const signalName = getPayloadString(event.payload, "signalName");
    return {
      id: event.id,
      label:
        signalName === null
          ? "Signal reported"
          : `Signal ${signalName} reported`,
      tone: "success",
    };
  }
  if (event.type === "signal_edges_activated") {
    const signalName = getPayloadString(event.payload, "signalName");
    return {
      id: event.id,
      label:
        signalName === null ? "Signal routed" : `Signal ${signalName} routed`,
      tone: "success",
    };
  }
  if (event.type === "child_run_completed") {
    return {
      id: event.id,
      label: "Chat completed",
      tone: "success",
    };
  }
  if (event.type === "child_run_failed") {
    return {
      id: event.id,
      label: "Chat failed",
      tone: "danger",
    };
  }
  if (event.type === "child_run_edges_activated") {
    return {
      id: event.id,
      label: "Chat output routed",
      tone: "default",
    };
  }
  if (event.type === "gate_blocked") {
    return {
      id: event.id,
      label: "Gate blocked",
      tone: "danger",
    };
  }
  if (event.type === "run_blocked") {
    return {
      id: event.id,
      label: "Workflow blocked",
      tone: "danger",
    };
  }
  if (event.type === "child_runs_cancelled") {
    const cancelledCount = getPayloadArrayLength(event.payload, "childRunIds");
    if (cancelledCount === null) {
      return {
        id: event.id,
        label: "Child runs cancelled",
        tone: "warning",
      };
    }
    return {
      id: event.id,
      label: `Cancelled ${cancelledCount} child ${pluralize(cancelledCount, "run")}`,
      tone: "warning",
    };
  }
  if (event.type === "end_reached") {
    return {
      id: event.id,
      label: "Reached end",
      tone: "success",
    };
  }
  if (event.type === "run_completed") {
    return {
      id: event.id,
      label: "Workflow completed",
      tone: "success",
    };
  }
  if (event.type === "run_cancelled") {
    return {
      id: event.id,
      label: "Workflow stopped",
      tone: "warning",
    };
  }
  if (event.type === "start_edge_action_failed") {
    return {
      id: event.id,
      label: "Start failed",
      tone: "danger",
    };
  }
  if (event.type === "gate_satisfied") {
    return {
      id: event.id,
      label: "Gate satisfied",
      tone: "success",
    };
  }
  if (event.type === "gate_input_activated") {
    return {
      id: event.id,
      label: "Gate input received",
      tone: "default",
    };
  }
  if (event.type === "run_failed") {
    return {
      id: event.id,
      label: "Workflow failed",
      tone: "danger",
    };
  }
  return null;
}

function getRunOutputs(run: AgentRun | null): Record<string, unknown> | null {
  if (run === null || run.outputs === null || Array.isArray(run.outputs)) {
    return null;
  }
  return run.outputs;
}

function getPayloadString(
  payload: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (payload === null || payload === undefined || Array.isArray(payload)) {
    return null;
  }
  const rawValue = payload[key];
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return null;
  }
  return rawValue;
}

function getPayloadArrayLength(
  payload: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (payload === null || payload === undefined || Array.isArray(payload)) {
    return null;
  }
  const rawValue = payload[key];
  if (!Array.isArray(rawValue)) {
    return null;
  }
  return rawValue.length;
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
