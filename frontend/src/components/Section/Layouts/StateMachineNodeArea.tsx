import _ from "lodash";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
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

export function StateMachineNodeArea({ sectionId }: StateMachineNodeAreaProps) {
  const snapshot = useProjectState(() => getNodeSnapshot(sectionId), _.isEqual);
  const machineGroupId = snapshot.machineGroupId.trim();
  const title = getNodeTitle(snapshot);
  const kindLabel = getNodeKindLabel(snapshot);

  return (
    <div className="flex h-full w-full items-stretch px-3 pb-3">
      <section
        className={`flex min-h-[84px] w-full flex-col justify-between rounded-xl border px-4 py-3 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.7)] ${getNodeThemeClasses(snapshot.type)}`}
      >
        <header className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-70">
            Workflow
          </span>
          <span className="border-current/15 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
            {kindLabel}
          </span>
        </header>
        <div className="space-y-1">
          <p className="truncate text-base font-semibold">{title}</p>
          <p className="truncate font-mono text-[11px] opacity-75">
            {machineGroupId !== "" ? machineGroupId : "machine-group-unset"}
          </p>
        </div>
      </section>
    </div>
  );
}
