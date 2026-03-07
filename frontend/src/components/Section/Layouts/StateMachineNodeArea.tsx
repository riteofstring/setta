import _ from "lodash";
import { useEffect, useState } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  getLatestStateMachineRun,
  resetStateMachineRun,
  startStateMachineRun,
  stopStateMachineRun,
  subscribeStateMachineRunPolling,
} from "state/actions/stateMachineRuns";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import {
  AgentRunStatusEnum,
  SectionTypeEnum,
  StateMachineGateTypeEnum,
} from "utils/generatedTypes";

type StateMachineNodeAreaProps = {
  sectionId: string;
};

type StateMachineNodeSnapshot = {
  type:
    | SectionTypeEnum.StateMachineStart
    | SectionTypeEnum.StateMachineGate
    | SectionTypeEnum.StateMachineEnd;
  machineGroupId: string;
  label: string;
  gateType: string | null;
};

function getNodeSnapshot(sectionId: string): StateMachineNodeSnapshot {
  const impl = getCurrEffectiveSectionImpl(
    useProjectState.getState(),
    sectionId,
  );
  if (impl.type === SectionTypeEnum.StateMachineGate) {
    return {
      type: impl.type,
      machineGroupId: impl.machineGroupId,
      label: impl.label,
      gateType: impl.gateType,
    };
  }
  if (
    impl.type === SectionTypeEnum.StateMachineStart ||
    impl.type === SectionTypeEnum.StateMachineEnd
  ) {
    return {
      type: impl.type,
      machineGroupId: impl.machineGroupId,
      label: impl.label,
      gateType: null,
    };
  }
  throw new Error(`Section ${sectionId} is not a state machine node.`);
}

function getNodeKindLabel(snapshot: StateMachineNodeSnapshot): string {
  if (snapshot.type === SectionTypeEnum.StateMachineStart) {
    return "Start";
  }
  if (snapshot.type === SectionTypeEnum.StateMachineEnd) {
    return "End";
  }
  return snapshot.gateType ?? "Gate";
}

function getNodeTitle(snapshot: StateMachineNodeSnapshot): string {
  if (snapshot.label.trim() !== "") {
    return snapshot.label;
  }
  if (snapshot.type === SectionTypeEnum.StateMachineGate) {
    return `${snapshot.gateType ?? StateMachineGateTypeEnum.AND} Gate`;
  }
  return getNodeKindLabel(snapshot);
}

function getNodeThemeClasses(type: StateMachineNodeSnapshot["type"]): string {
  if (type === SectionTypeEnum.StateMachineStart) {
    return "border-emerald-300/70 bg-emerald-50/90 text-emerald-950 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
  if (type === SectionTypeEnum.StateMachineEnd) {
    return "border-rose-300/70 bg-rose-50/90 text-rose-950 dark:border-rose-800/80 dark:bg-rose-950/40 dark:text-rose-100";
  }
  return "border-amber-300/70 bg-amber-50/90 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100";
}

type MachineRunPresentation = {
  statusLabel: string;
  statusClasses: string;
  isRunning: boolean;
  hasRun: boolean;
};

function getMachineRunPresentation(
  runs: Parameters<typeof getLatestStateMachineRun>[0],
  projectConfigId: string,
  machineGroupId: string,
): MachineRunPresentation {
  const latestRun = getLatestStateMachineRun(
    runs,
    projectConfigId,
    machineGroupId,
  );
  if (!latestRun) {
    return {
      statusLabel: "Idle",
      statusClasses:
        "border-slate-300/70 bg-white/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200",
      isRunning: false,
      hasRun: false,
    };
  }
  if (latestRun.status === AgentRunStatusEnum.running) {
    return {
      statusLabel: "Running",
      statusClasses:
        "border-emerald-400/70 bg-emerald-500/10 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
      isRunning: true,
      hasRun: true,
    };
  }
  if (latestRun.status === AgentRunStatusEnum.completed) {
    return {
      statusLabel: "Completed",
      statusClasses:
        "border-sky-400/70 bg-sky-500/10 text-sky-800 dark:border-sky-700 dark:bg-sky-500/15 dark:text-sky-200",
      isRunning: false,
      hasRun: true,
    };
  }
  if (latestRun.status === AgentRunStatusEnum.failed) {
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

export function StateMachineNodeArea({ sectionId }: StateMachineNodeAreaProps) {
  const snapshot = useProjectState(() => getNodeSnapshot(sectionId), _.isEqual);
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const machineRun = useAIStore(
    (state) =>
      getMachineRunPresentation(
        state.agentRuns,
        projectConfigId,
        snapshot.machineGroupId,
      ),
    _.isEqual,
  );
  const [pendingAction, setPendingAction] = useState<
    "start" | "stop" | "reset" | null
  >(null);
  const machineGroupId = snapshot.machineGroupId.trim();
  const title = getNodeTitle(snapshot);
  const kindLabel = getNodeKindLabel(snapshot);
  const showMachineStatus = snapshot.type !== SectionTypeEnum.StateMachineEnd;
  const showControls = snapshot.type === SectionTypeEnum.StateMachineStart;
  const controlsDisabled =
    pendingAction !== null || machineGroupId === "" || isDeploymentMode;

  useEffect(() => {
    if (!showMachineStatus || machineGroupId === "") {
      return;
    }
    return subscribeStateMachineRunPolling();
  }, [machineGroupId, showMachineStatus]);

  async function handleStartClick(): Promise<void> {
    setPendingAction("start");
    try {
      await startStateMachineRun(machineGroupId, sectionId);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleStopClick(): Promise<void> {
    setPendingAction("stop");
    try {
      await stopStateMachineRun(machineGroupId);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleResetClick(): Promise<void> {
    setPendingAction("reset");
    try {
      await resetStateMachineRun(machineGroupId);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="section-main-full-w flex h-full min-h-0 w-full items-stretch px-2 pb-2">
      <section
        className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border px-3 py-2 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.7)] ${getNodeThemeClasses(snapshot.type)}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-70">
            Workflow
          </span>
          <span className="border-current/15 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
            {kindLabel}
          </span>
        </header>
        <div className="mt-1 min-h-0 space-y-0.5">
          <p className="truncate text-sm font-semibold leading-tight">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] leading-tight opacity-75">
            {machineGroupId !== "" ? machineGroupId : "machine-group-unset"}
          </p>
        </div>
        {showMachineStatus ? (
          <div className="mt-auto flex shrink-0 flex-col gap-1.5 pt-1.5">
            {showControls ? (
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${machineRun.statusClasses}`}
                  data-testid={`state-machine-run-status-${sectionId}`}
                >
                  {machineRun.statusLabel}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <button
                    className="nodrag rounded-md border border-emerald-500/50 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45 dark:border-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 dark:hover:bg-emerald-500/30"
                    data-testid={`state-machine-start-button-${sectionId}`}
                    disabled={controlsDisabled || machineRun.isRunning}
                    onClick={() => {
                      void handleStartClick();
                    }}
                    type="button"
                  >
                    Start
                  </button>
                  <button
                    className="nodrag rounded-md border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-45 dark:border-amber-600 dark:bg-amber-500/20 dark:text-amber-100 dark:hover:bg-amber-500/30"
                    data-testid={`state-machine-stop-button-${sectionId}`}
                    disabled={controlsDisabled || !machineRun.isRunning}
                    onClick={() => {
                      void handleStopClick();
                    }}
                    type="button"
                  >
                    Stop
                  </button>
                  <button
                    className="nodrag rounded-md border border-slate-500/40 bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-900 transition hover:bg-slate-500/20 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-600 dark:bg-slate-500/15 dark:text-slate-100 dark:hover:bg-slate-500/25"
                    data-testid={`state-machine-reset-button-${sectionId}`}
                    disabled={controlsDisabled || !machineRun.hasRun}
                    onClick={() => {
                      void handleResetClick();
                    }}
                    type="button"
                  >
                    Reset
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-65">
                  Status
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${machineRun.statusClasses}`}
                  data-testid={`state-machine-run-status-${sectionId}`}
                >
                  {machineRun.statusLabel}
                </span>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
