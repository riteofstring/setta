import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { isCanvasOwnedSectionStateMachineGateDropdown } from "forks/xyflow/core/container/sectionShellCanvasOwnership";
import _ from "lodash";
import { setStateMachineSectionSettings } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import React from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  BaseSectionImplUnion,
  SectionTypeEnum,
  StateMachineGateType,
  StateMachineUIConfig,
} from "utils/generatedTypes";
type StateMachineSectionSettingsProps = {
  sectionId: string;
};
type StateMachineSectionState = {
  type:
    | SectionTypeEnum.StateMachineStart
    | SectionTypeEnum.StateMachineGate
    | SectionTypeEnum.StateMachineEnd;
  machineGroupId: string;
  label: string;
  gateType: StateMachineGateType | null;
  isFrozen: boolean;
};
type StateMachineSectionImpl = Extract<
  BaseSectionImplUnion,
  {
    type:
      | SectionTypeEnum.StateMachineStart
      | SectionTypeEnum.StateMachineGate
      | SectionTypeEnum.StateMachineEnd;
  }
>;
const GATE_TYPE_OPTIONS = [
  {
    group: "Gate Types",
    items: StateMachineUIConfig.gateTypeOptions.map((option) => ({
      id: option.value,
      name: option.label,
    })),
  },
];
function getStateMachineSectionState(
  impl: StateMachineSectionImpl,
): StateMachineSectionState {
  if (impl.type === SectionTypeEnum.StateMachineStart) {
    return {
      type: impl.type,
      machineGroupId: impl.machineGroupId,
      label: impl.label,
      gateType: null,
      isFrozen: impl.isFrozen,
    };
  }
  if (impl.type === SectionTypeEnum.StateMachineGate) {
    return {
      type: impl.type,
      machineGroupId: impl.machineGroupId,
      label: impl.label,
      gateType: impl.gateType,
      isFrozen: impl.isFrozen,
    };
  }
  return {
    type: impl.type,
    machineGroupId: impl.machineGroupId,
    label: impl.label,
    gateType: null,
    isFrozen: impl.isFrozen,
  };
}
function getDefaultLabel(
  type: StateMachineSectionState["type"],
  gateType: StateMachineGateType | null,
): string {
  if (type === SectionTypeEnum.StateMachineStart) {
    return "Start";
  }
  if (type === SectionTypeEnum.StateMachineEnd) {
    return "End";
  }
  if (gateType) {
    return `${gateType} Gate`;
  }
  return "Gate";
}
export function StateMachineSectionSettings({
  sectionId,
}: StateMachineSectionSettingsProps) {
  const { canEditLayout } = useShareCapabilities();
  const sectionState = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (
      impl.type !== SectionTypeEnum.StateMachineStart &&
      impl.type !== SectionTypeEnum.StateMachineGate &&
      impl.type !== SectionTypeEnum.StateMachineEnd
    ) {
      throw new Error(`Section ${sectionId} is not a state machine section.`);
    }
    return getStateMachineSectionState(impl);
  }, _.isEqual);
  const isDisabled = sectionState.isFrozen || !canEditLayout;
  const [machineGroupIdDraft, setMachineGroupIdDraft] = React.useState(
    sectionState.machineGroupId,
  );
  const [labelDraft, setLabelDraft] = React.useState(sectionState.label);
  React.useEffect(() => {
    setMachineGroupIdDraft(sectionState.machineGroupId);
    setLabelDraft(sectionState.label);
  }, [sectionState.label, sectionState.machineGroupId, sectionState.type]);
  function persist(next: {
    machineGroupId: string;
    label: string;
    gateType: StateMachineGateType | null;
  }) {
    const machineGroupId = next.machineGroupId.trim();
    const label = next.label.trim();
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        if (sectionState.type === SectionTypeEnum.StateMachineStart) {
          setCurrEffectiveSectionImplValue<"StateMachineStartSection">(
            state,
            sectionId,
            {
              machineGroupId,
              label,
            },
          );
          return;
        }
        if (sectionState.type === SectionTypeEnum.StateMachineEnd) {
          setCurrEffectiveSectionImplValue<"StateMachineEndSection">(
            state,
            sectionId,
            {
              machineGroupId,
              label,
            },
          );
          return;
        }
        setCurrEffectiveSectionImplValue<"StateMachineGateSection">(
          state,
          sectionId,
          {
            machineGroupId,
            label,
            gateType: next.gateType ?? StateMachineUIConfig.defaultGateType,
          },
        );
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setStateMachineSectionSettings({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              machineGroupId,
              label,
              gateType: next.gateType,
              frontendOpId,
            },
          } as Parameters<typeof setStateMachineSectionSettings>[0]),
        ),
    });
  }
  function commitDrafts() {
    if (
      machineGroupIdDraft.trim() === sectionState.machineGroupId &&
      labelDraft.trim() === sectionState.label
    ) {
      return;
    }
    persist({
      machineGroupId: machineGroupIdDraft,
      label: labelDraft,
      gateType: sectionState.gateType,
    });
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border border-setta-200/70 p-3 dark:border-setta-700/70">
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-setta-700 dark:text-setta-300">
          Workflow
        </p>
        <p className="text-[11px] text-setta-500 dark:text-setta-400">
          Keep control sections in the same machine group and give them short,
          readable labels.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
        Machine Group ID
        <input
          value={machineGroupIdDraft}
          onChange={(event) => setMachineGroupIdDraft(event.target.value)}
          onBlur={commitDrafts}
          disabled={isDisabled}
          placeholder="workflow-main"
          className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
        Label
        <input
          value={labelDraft}
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={commitDrafts}
          disabled={isDisabled}
          placeholder={getDefaultLabel(
            sectionState.type,
            sectionState.gateType,
          )}
          className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        />
      </label>

      {sectionState.type === SectionTypeEnum.StateMachineGate ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-setta-600 dark:text-setta-300">
            Gate Type
          </p>
          <IdNameCombobox
            allItems={GATE_TYPE_OPTIONS}
            canvasOwnedRestingInput={isCanvasOwnedSectionStateMachineGateDropdown(
              sectionId,
            )}
            value={sectionState.gateType}
            isDisabled={isDisabled}
            onSelectedItemChange={(gateType) => {
              if (!gateType) {
                return;
              }
              persist({
                machineGroupId: machineGroupIdDraft,
                label: labelDraft,
                gateType,
              });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
