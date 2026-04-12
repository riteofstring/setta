import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useEffect, useState } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { getStateMachineDraftWarning } from "state/actions/stateMachineDraftValidation";
import {
  loadStateMachineRuns,
  resetStateMachineRun,
  startStateMachineRun,
  stopStateMachineRun,
} from "state/actions/stateMachineRuns";
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

type PendingAction = "start" | "stop" | "reset" | null;
type MachineAction = Exclude<PendingAction, null>;
type StateMachineRunPresentation = ReturnType<
  typeof getStateMachineNodePresentation
>;
type StateMachineActivityTone =
  StateMachineRunPresentation["activityItems"][number]["tone"];
type StateMachineActivityClasses = {
  dot: string;
  text: string;
};
type StateMachineStatusRow = {
  label: string;
  value: string;
  dataTestId: string;
  valueClassName: string;
};

const NODE_THEME_CLASSES_BY_TYPE: Record<
  StateMachineNodeSnapshot["type"],
  string
> = {
  [SectionTypeEnum.StateMachineStart]:
    "border-emerald-300/70 bg-emerald-50/90 text-emerald-950 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-100",
  [SectionTypeEnum.StateMachineGate]:
    "border-amber-300/70 bg-amber-50/90 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100",
  [SectionTypeEnum.StateMachineEnd]:
    "border-rose-300/70 bg-rose-50/90 text-rose-950 dark:border-rose-800/80 dark:bg-rose-950/40 dark:text-rose-100",
};

const ACTIVITY_ITEM_CLASSES_BY_TONE: Record<
  StateMachineActivityTone,
  StateMachineActivityClasses
> = {
  default: {
    dot: "bg-slate-500/70 dark:bg-slate-300/70",
    text: "text-slate-900 dark:text-slate-100",
  },
  success: {
    dot: "bg-emerald-500/80 dark:bg-emerald-400/80",
    text: "text-emerald-900 dark:text-emerald-100",
  },
  warning: {
    dot: "bg-amber-500/80 dark:bg-amber-400/80",
    text: "text-amber-950 dark:text-amber-100",
  },
  danger: {
    dot: "bg-rose-500/80 dark:bg-rose-400/80",
    text: "text-rose-900 dark:text-rose-100",
  },
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
  return NODE_THEME_CLASSES_BY_TYPE[type];
}

function getActivityHeading(
  sectionType: StateMachineNodeSnapshot["type"],
): string {
  return sectionType === SectionTypeEnum.StateMachineGate
    ? "Gate Activity"
    : "Recent Activity";
}

function getEmptyActivityLabel(
  sectionType: StateMachineNodeSnapshot["type"],
): string {
  return sectionType === SectionTypeEnum.StateMachineGate
    ? "No gate activity yet."
    : "No recent activity yet.";
}

function getActivityItemClasses(
  tone: StateMachineActivityTone,
): StateMachineActivityClasses {
  return ACTIVITY_ITEM_CLASSES_BY_TONE[tone];
}

function getReadOnlyStatusRows(
  sectionId: string,
  machineRun: StateMachineRunPresentation,
): StateMachineStatusRow[] {
  const rows: StateMachineStatusRow[] = [
    {
      label: "Machine",
      value: machineRun.statusLabel,
      dataTestId: `state-machine-run-status-${sectionId}`,
      valueClassName: `rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${machineRun.statusClasses}`,
    },
  ];
  if (machineRun.gateStatus) {
    rows.push({
      label: "Gate",
      value: machineRun.gateStatus.label,
      dataTestId: `state-machine-gate-status-${sectionId}`,
      valueClassName: `rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${machineRun.gateStatus.classes}`,
    });
  }
  if (machineRun.gateInputProgress) {
    rows.push({
      label: "Inputs",
      value: machineRun.gateInputProgress.label,
      dataTestId: `state-machine-gate-input-progress-${sectionId}`,
      valueClassName: `rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${machineRun.gateInputProgress.classes}`,
    });
  }
  return rows;
}

function useStateMachineNodeViewModel(sectionId: string) {
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
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const machineGroupId = snapshot.machineGroupId.trim();
  const showMachineStatus = snapshot.type !== SectionTypeEnum.StateMachineEnd;
  const showControls = snapshot.type === SectionTypeEnum.StateMachineStart;
  const showActivityPanel = showMachineStatus && machineRun.hasRun;
  const controlsDisabled =
    pendingAction !== null || machineGroupId === "" || isDeploymentMode;

  useEffect(() => {
    if (!showMachineStatus || machineGroupId === "") {
      return;
    }
    loadStateMachineRuns();
  }, [machineGroupId, showMachineStatus]);

  async function runAction(
    action: MachineAction,
    effect: () => Promise<unknown>,
  ): Promise<void> {
    setPendingAction(action);
    try {
      await effect();
    } finally {
      setPendingAction(null);
    }
  }

  return {
    snapshot,
    machineRun,
    title: getNodeTitle(snapshot),
    kindLabel: getNodeKindLabel(snapshot),
    machineGroupId,
    draftWarningDetail: draftWarning?.detail ?? null,
    showMachineStatus,
    showControls,
    showActivityPanel,
    controlsDisabled,
    handleStartClick: () =>
      runAction("start", () => startStateMachineRun(machineGroupId, sectionId)),
    handleStopClick: () =>
      runAction("stop", () => stopStateMachineRun(machineGroupId)),
    handleResetClick: () =>
      runAction("reset", () => resetStateMachineRun(machineGroupId)),
  };
}

function StateMachineNodeHeader({
  sectionId,
  kindLabel,
  draftWarningDetail,
}: {
  sectionId: string;
  kindLabel: string;
  draftWarningDetail: string | null;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-70">
        Workflow
      </span>
      <div className="flex items-center gap-1.5">
        {draftWarningDetail ? (
          <span
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 px-1 text-[10px] font-bold leading-none text-amber-950 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100"
            data-testid={`state-machine-draft-warning-${sectionId}`}
            aria-label="Workflow draft warning"
            {...getFloatingBoxHandlers({
              content: draftWarningDetail,
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
  );
}

function StateMachineNodeIdentity({
  title,
  machineGroupId,
}: {
  title: string;
  machineGroupId: string;
}) {
  return (
    <div className="mt-1 min-h-0 space-y-0.5">
      <p className="truncate text-sm font-semibold leading-tight">{title}</p>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-[10px] leading-tight opacity-75">
          {machineGroupId !== "" ? machineGroupId : "machine-group-unset"}
        </p>
      </div>
    </div>
  );
}

function StateMachineActivityPanel({
  sectionId,
  sectionType,
  machineRun,
}: {
  sectionId: string;
  sectionType: StateMachineNodeSnapshot["type"];
  machineRun: StateMachineRunPresentation;
}) {
  const heading = getActivityHeading(sectionType);
  const emptyLabel = getEmptyActivityLabel(sectionType);

  return (
    <section
      className="border-current/10 min-h-0 flex-1 rounded-lg border bg-white/35 px-2 py-1.5 dark:bg-slate-950/20"
      data-testid={`state-machine-activity-panel-${sectionId}`}
    >
      <header className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-60">
          {heading}
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
          {emptyLabel}
        </p>
      )}
    </section>
  );
}

function StateMachineStartControls({
  sectionId,
  machineRun,
  controlsDisabled,
  onStart,
  onStop,
  onReset,
}: {
  sectionId: string;
  machineRun: StateMachineRunPresentation;
  controlsDisabled: boolean;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const buttons = [
    {
      label: "Start",
      className:
        "nodrag rounded-md border border-emerald-500/50 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45 dark:border-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 dark:hover:bg-emerald-500/30",
      dataTestId: `state-machine-start-button-${sectionId}`,
      disabled: controlsDisabled || machineRun.isRunning,
      onClick: onStart,
    },
    {
      label: "Stop",
      className:
        "nodrag rounded-md border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-45 dark:border-amber-600 dark:bg-amber-500/20 dark:text-amber-100 dark:hover:bg-amber-500/30",
      dataTestId: `state-machine-stop-button-${sectionId}`,
      disabled: controlsDisabled || !machineRun.isRunning,
      onClick: onStop,
    },
    {
      label: "Reset",
      className:
        "nodrag rounded-md border border-slate-500/40 bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-900 transition hover:bg-slate-500/20 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-600 dark:bg-slate-500/15 dark:text-slate-100 dark:hover:bg-slate-500/25",
      dataTestId: `state-machine-reset-button-${sectionId}`,
      disabled: controlsDisabled || !machineRun.hasRun,
      onClick: onReset,
    },
  ];

  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <span
        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${machineRun.statusClasses}`}
        data-testid={`state-machine-run-status-${sectionId}`}
      >
        {machineRun.statusLabel}
      </span>
      <div className="flex items-center justify-end gap-1">
        {buttons.map((button) => (
          <button
            key={button.label}
            className={button.className}
            data-testid={button.dataTestId}
            disabled={button.disabled}
            onClick={() => {
              void button.onClick();
            }}
            type="button"
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StateMachineReadOnlyStatus({
  sectionId,
  machineRun,
}: {
  sectionId: string;
  machineRun: StateMachineRunPresentation;
}) {
  const rows = getReadOnlyStatusRows(sectionId, machineRun);

  return (
    <div className="flex shrink-0 flex-col gap-1">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-2"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-65">
            {row.label}
          </span>
          <span className={row.valueClassName} data-testid={row.dataTestId}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function StateMachineStatusSection({
  sectionId,
  sectionType,
  machineRun,
  showActivityPanel,
  showControls,
  controlsDisabled,
  onStart,
  onStop,
  onReset,
}: {
  sectionId: string;
  sectionType: StateMachineNodeSnapshot["type"];
  machineRun: StateMachineRunPresentation;
  showActivityPanel: boolean;
  showControls: boolean;
  controlsDisabled: boolean;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onReset: () => Promise<void>;
}) {
  return (
    <div
      className={
        showActivityPanel
          ? "mt-1.5 flex min-h-0 flex-1 flex-col gap-1.5"
          : "mt-auto flex shrink-0 flex-col gap-1.5 pt-1.5"
      }
    >
      {showActivityPanel ? (
        <StateMachineActivityPanel
          sectionId={sectionId}
          sectionType={sectionType}
          machineRun={machineRun}
        />
      ) : null}
      {showControls ? (
        <StateMachineStartControls
          sectionId={sectionId}
          machineRun={machineRun}
          controlsDisabled={controlsDisabled}
          onStart={onStart}
          onStop={onStop}
          onReset={onReset}
        />
      ) : (
        <StateMachineReadOnlyStatus
          sectionId={sectionId}
          machineRun={machineRun}
        />
      )}
    </div>
  );
}

export function StateMachineNodeArea({ sectionId }: StateMachineNodeAreaProps) {
  const {
    snapshot,
    machineRun,
    title,
    kindLabel,
    machineGroupId,
    draftWarningDetail,
    showMachineStatus,
    showControls,
    showActivityPanel,
    controlsDisabled,
    handleStartClick,
    handleStopClick,
    handleResetClick,
  } = useStateMachineNodeViewModel(sectionId);

  return (
    <div className="section-main-full-w flex h-full min-h-0 w-full items-stretch px-2 pb-2">
      <section
        className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border px-3 py-2 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.7)] ${getNodeThemeClasses(snapshot.type)}`}
      >
        <StateMachineNodeHeader
          sectionId={sectionId}
          kindLabel={kindLabel}
          draftWarningDetail={draftWarningDetail}
        />
        <StateMachineNodeIdentity
          title={title}
          machineGroupId={machineGroupId}
        />
        {showMachineStatus ? (
          <StateMachineStatusSection
            sectionId={sectionId}
            sectionType={snapshot.type}
            machineRun={machineRun}
            showActivityPanel={showActivityPanel}
            showControls={showControls}
            controlsDisabled={controlsDisabled}
            onStart={handleStartClick}
            onStop={handleStopClick}
            onReset={handleResetClick}
          />
        ) : null}
      </section>
    </div>
  );
}
