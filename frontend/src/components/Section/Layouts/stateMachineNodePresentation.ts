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

type StateMachineGateStatus = "waiting" | "satisfied" | "blocked";

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
type StateMachineActivityDescriptor = Omit<StateMachineActivityItem, "id">;
type StateMachineActivityDefinition =
  | StateMachineActivityDescriptor
  | ((event: AgentRunEvent) => StateMachineActivityDescriptor);

const DEFAULT_ACTIVITY_ITEM_LIMIT = 3;
const STATE_MACHINE_GATE_STATUS_PRESENTATION: Record<
  StateMachineGateStatus,
  NonNullable<StateMachineGateStatusPresentation>
> = {
  waiting: {
    label: "Waiting",
    classes:
      "border-amber-400/70 bg-amber-500/10 text-amber-800 dark:border-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
  },
  satisfied: {
    label: "Satisfied",
    classes:
      "border-emerald-400/70 bg-emerald-500/10 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  },
  blocked: {
    label: "Blocked",
    classes:
      "border-rose-400/70 bg-rose-500/10 text-rose-800 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
  },
};
const MACHINE_ACTIVITY_ITEM_BY_EVENT_TYPE: Partial<
  Record<AgentRunEvent["type"], StateMachineActivityDefinition>
> = {
  run_started: {
    label: "Workflow started",
    tone: "default",
  },
  start_edge_actions_dispatched: buildStartActionsDispatchedActivityItem,
  start_edge_action_dispatched: {
    label: "Start prompt dispatched",
    tone: "default",
  },
  start_edge_action_reset: {
    label: "Start thread reset",
    tone: "default",
  },
  edge_action_dispatched: {
    label: "Prompt dispatched",
    tone: "default",
  },
  edge_action_reset: {
    label: "Thread reset",
    tone: "default",
  },
  signal_reported: buildSignalReportedActivityItem,
  signal_edges_activated: buildSignalRoutedActivityItem,
  child_run_completed: {
    label: "Chat completed",
    tone: "success",
  },
  child_run_failed: {
    label: "Chat failed",
    tone: "danger",
  },
  child_run_edges_activated: {
    label: "Chat output routed",
    tone: "default",
  },
  gate_blocked: {
    label: "Gate blocked",
    tone: "danger",
  },
  run_blocked: {
    label: "Workflow blocked",
    tone: "danger",
  },
  child_runs_cancelled: buildChildRunsCancelledActivityItem,
  end_reached: {
    label: "Reached end",
    tone: "success",
  },
  run_completed: {
    label: "Workflow completed",
    tone: "success",
  },
  run_cancelled: {
    label: "Workflow stopped",
    tone: "warning",
  },
  start_edge_action_failed: {
    label: "Start failed",
    tone: "danger",
  },
  gate_satisfied: {
    label: "Gate satisfied",
    tone: "success",
  },
  gate_input_activated: {
    label: "Gate input received",
    tone: "default",
  },
  run_failed: {
    label: "Workflow failed",
    tone: "danger",
  },
};

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
  return rawGateStatus === null
    ? null
    : STATE_MACHINE_GATE_STATUS_PRESENTATION[rawGateStatus];
}

function getGateInputProgressPresentation(
  run: AgentRun | null,
  sectionId: string,
): StateMachineGateInputProgressPresentation {
  const outputs = getRunOutputs(run);
  if (outputs === null) {
    return null;
  }
  const totalCount = getSectionPayloadStringArrayCount(
    outputs,
    "gateIncomingEdgeIdsBySectionId",
    sectionId,
  );
  if (totalCount === null || totalCount === 0) {
    return null;
  }
  const receivedCount =
    getSectionPayloadStringArrayCount(
      outputs,
      "gateInputEdgeIdsBySectionId",
      sectionId,
    ) ?? 0;
  const rawGateStatus = getGateStatus(run, sectionId);
  return {
    label: `${receivedCount} / ${totalCount}`,
    classes: getGateInputProgressClasses(
      rawGateStatus,
      receivedCount,
      totalCount,
    ),
  };
}

function getGateStatus(
  run: AgentRun | null,
  sectionId: string,
): StateMachineGateStatus | null {
  const outputs = getRunOutputs(run);
  if (outputs === null) {
    return null;
  }
  const rawGateStatuses = getPayloadRecord(outputs, "gateStatusBySectionId");
  if (rawGateStatuses === null) {
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
  const definition = MACHINE_ACTIVITY_ITEM_BY_EVENT_TYPE[event.type];
  if (definition === undefined) {
    return null;
  }
  const descriptor =
    typeof definition === "function" ? definition(event) : definition;
  return {
    id: event.id,
    ...descriptor,
  };
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

function getPayloadRecord(
  payload: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  if (payload === null || payload === undefined || Array.isArray(payload)) {
    return null;
  }
  const rawValue = payload[key];
  if (
    rawValue === null ||
    typeof rawValue !== "object" ||
    Array.isArray(rawValue)
  ) {
    return null;
  }
  return rawValue as Record<string, unknown>;
}

function getStringArrayCount(value: unknown): number | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((entry): entry is string => typeof entry === "string")
    .length;
}

function getSectionPayloadStringArrayCount(
  payload: Record<string, unknown>,
  key: string,
  sectionId: string,
): number | null {
  const sectionsById = getPayloadRecord(payload, key);
  if (sectionsById === null) {
    return null;
  }
  return getStringArrayCount(sectionsById[sectionId]);
}

function getGateInputProgressClasses(
  gateStatus: StateMachineGateStatus | null,
  receivedCount: number,
  totalCount: number,
): string {
  if (gateStatus === "blocked") {
    return STATE_MACHINE_GATE_STATUS_PRESENTATION.blocked.classes;
  }
  return receivedCount >= totalCount
    ? STATE_MACHINE_GATE_STATUS_PRESENTATION.satisfied.classes
    : STATE_MACHINE_GATE_STATUS_PRESENTATION.waiting.classes;
}

function buildStartActionsDispatchedActivityItem(
  event: AgentRunEvent,
): StateMachineActivityDescriptor {
  const actionCount = getPayloadArrayLength(event.payload, "actions");
  if (actionCount === null) {
    return {
      label: "Start actions dispatched",
      tone: "default",
    };
  }
  return {
    label: `Dispatched ${actionCount} start ${pluralize(actionCount, "action")}`,
    tone: "default",
  };
}

function buildSignalReportedActivityItem(
  event: AgentRunEvent,
): StateMachineActivityDescriptor {
  return {
    label: getSignalActivityLabel(event, {
      emptyLabel: "Signal reported",
      suffix: "reported",
    }),
    tone: "success",
  };
}

function buildSignalRoutedActivityItem(
  event: AgentRunEvent,
): StateMachineActivityDescriptor {
  return {
    label: getSignalActivityLabel(event, {
      emptyLabel: "Signal routed",
      suffix: "routed",
    }),
    tone: "success",
  };
}

function getSignalActivityLabel(
  event: AgentRunEvent,
  args: {
    emptyLabel: string;
    suffix: string;
  },
): string {
  const signalName = getPayloadString(event.payload, "signalName");
  return signalName === null
    ? args.emptyLabel
    : `Signal ${signalName} ${args.suffix}`;
}

function buildChildRunsCancelledActivityItem(
  event: AgentRunEvent,
): StateMachineActivityDescriptor {
  const cancelledCount = getPayloadArrayLength(event.payload, "childRunIds");
  if (cancelledCount === null) {
    return {
      label: "Child runs cancelled",
      tone: "warning",
    };
  }
  return {
    label: `Cancelled ${cancelledCount} child ${pluralize(cancelledCount, "run")}`,
    tone: "warning",
  };
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
