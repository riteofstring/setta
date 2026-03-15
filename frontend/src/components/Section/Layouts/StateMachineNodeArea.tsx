import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useEffect, useState } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { getStateMachineDraftWarning } from "state/actions/stateMachineDraftValidation";
import {
  resetStateMachineRun,
  startStateMachineRun,
  stopStateMachineRun,
} from "state/actions/stateMachineRunMutations";
import { subscribeStateMachineRunPolling } from "state/actions/stateMachineRunPolling";
import {
  useAIStore,
  useProjectState,
  useShareSession,
} from "state/definitions";
import {
  SectionTypeEnum,
  StateMachineGateTypeEnum,
} from "utils/generatedTypes";
import { getStateMachineNodePresentation } from "./stateMachineNodePresentation";

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

export function StateMachineNodeArea({ sectionId }: StateMachineNodeAreaProps) {
  const snapshot = useProjectState(() => getNodeSnapshot(sectionId), _.isEqual);
  const draftWarning = useProjectState(
    (state) => getStateMachineDraftWarning(state, snapshot.machineGroupId),
    _.isEqual,
  );
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const machineRun = useAIStore(
    (state) =>
      getStateMachineNodePresentation({
        runs: state.agentRuns,
        projectConfigId,
        machineGroupId: snapshot.machineGroupId,
        sectionId,
        sectionType: snapshot.type,
      }),
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
  const showActivityPanel = showMachineStatus && machineRun.hasRun;
  const showDraftWarning = draftWarning !== null;
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

  function getActivityItemClasses(
    tone: "default" | "success" | "warning" | "danger",
  ): {
    dot: string;
    text: string;
  } {
    if (tone === "success") {
      return {
        dot: "bg-emerald-500/80 dark:bg-emerald-400/80",
        text: "text-emerald-900 dark:text-emerald-100",
      };
    }
    if (tone === "warning") {
      return {
        dot: "bg-amber-500/80 dark:bg-amber-400/80",
        text: "text-amber-950 dark:text-amber-100",
      };
    }
    if (tone === "danger") {
      return {
        dot: "bg-rose-500/80 dark:bg-rose-400/80",
        text: "text-rose-900 dark:text-rose-100",
      };
    }
    return {
      dot: "bg-slate-500/70 dark:bg-slate-300/70",
      text: "text-slate-900 dark:text-slate-100",
    };
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
          <div className="flex items-center gap-1.5">
            {showDraftWarning ? (
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 px-1 text-[10px] font-bold leading-none text-amber-950 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100"
                data-testid={`state-machine-draft-warning-${sectionId}`}
                aria-label="Workflow draft warning"
                {...getFloatingBoxHandlers({
                  content: draftWarning.detail,
                })}
              >
                !
              </span>
            ) : null}
            <span className="border-current/15 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
              {kindLabel}
            </span>
          </div>
        </header>
        <div className="mt-1 min-h-0 space-y-0.5">
          <p className="truncate text-sm font-semibold leading-tight">
            {title}
          </p>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-mono text-[10px] leading-tight opacity-75">
              {machineGroupId !== "" ? machineGroupId : "machine-group-unset"}
            </p>
          </div>
        </div>
        {showMachineStatus ? (
          <div
            className={
              showActivityPanel
                ? "mt-1.5 flex min-h-0 flex-1 flex-col gap-1.5"
                : "mt-auto flex shrink-0 flex-col gap-1.5 pt-1.5"
            }
          >
            {showActivityPanel ? (
              <section
                className="border-current/10 min-h-0 flex-1 rounded-lg border bg-white/35 px-2 py-1.5 dark:bg-slate-950/20"
                data-testid={`state-machine-activity-panel-${sectionId}`}
              >
                <header className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-60">
                    {snapshot.type === SectionTypeEnum.StateMachineGate
                      ? "Gate Activity"
                      : "Recent Activity"}
                  </span>
                </header>
                {machineRun.activityItems.length > 0 ? (
                  <ul className="min-h-0 space-y-1 overflow-auto pr-0.5">
                    {machineRun.activityItems.map((item) => {
                      const activityClasses = getActivityItemClasses(item.tone);
                      return (
                        <li
                          key={item.id}
                          className={`flex items-start gap-1 text-[10px] leading-[1.05rem] ${activityClasses.text}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full ${activityClasses.dot}`}
                          />
                          <span className="truncate">{item.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="truncate text-[10px] leading-[1.05rem] opacity-65">
                    {snapshot.type === SectionTypeEnum.StateMachineGate
                      ? "No gate activity yet."
                      : "No recent activity yet."}
                  </p>
                )}
              </section>
            ) : null}
            {showControls ? (
              <div className="flex shrink-0 items-center justify-between gap-2">
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
              <div className="flex shrink-0 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-65">
                    Machine
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${machineRun.statusClasses}`}
                    data-testid={`state-machine-run-status-${sectionId}`}
                  >
                    {machineRun.statusLabel}
                  </span>
                </div>
                {machineRun.gateStatus ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-65">
                      Gate
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${machineRun.gateStatus.classes}`}
                      data-testid={`state-machine-gate-status-${sectionId}`}
                    >
                      {machineRun.gateStatus.label}
                    </span>
                  </div>
                ) : null}
                {machineRun.gateInputProgress ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-65">
                      Inputs
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${machineRun.gateInputProgress.classes}`}
                      data-testid={`state-machine-gate-input-progress-${sectionId}`}
                    >
                      {machineRun.gateInputProgress.label}
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
