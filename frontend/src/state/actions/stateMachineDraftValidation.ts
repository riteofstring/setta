import {
  SectionTypeEnum,
  type ProjectStateSingleConfig,
} from "utils/generatedTypes";
import { getCurrEffectiveSectionImpl } from "./sectionInfos";

type StateMachineDraftWarning = {
  detail: string;
  endCount: number;
  startCount: number;
};

export function getStateMachineDraftWarning(
  state: ProjectStateSingleConfig,
  machineGroupId: string,
): StateMachineDraftWarning | null {
  const normalizedMachineGroupId = machineGroupId.trim();
  if (normalizedMachineGroupId === "") {
    return {
      detail: "Set a machine group ID so this gate can belong to a workflow.",
      startCount: 0,
      endCount: 0,
    };
  }

  let startCount = 0;
  let endCount = 0;

  for (const sectionId of Object.keys(state.projectConfig.sectionVariantMap)) {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (impl.type === SectionTypeEnum.StateMachineStart) {
      if (impl.machineGroupId === normalizedMachineGroupId) {
        startCount += 1;
      }
      continue;
    }
    if (
      impl.type === SectionTypeEnum.StateMachineEnd &&
      impl.machineGroupId === normalizedMachineGroupId
    ) {
      endCount += 1;
    }
  }

  if (startCount === 1 && endCount >= 1) {
    return null;
  }

  return {
    detail: buildDraftWarningDetail({
      machineGroupId: normalizedMachineGroupId,
      startCount,
      endCount,
    }),
    startCount,
    endCount,
  };
}

function buildDraftWarningDetail({
  machineGroupId,
  startCount,
  endCount,
}: {
  machineGroupId: string;
  startCount: number;
  endCount: number;
}): string {
  return (
    `Workflow draft incomplete for machine group ${machineGroupId}. ` +
    `It currently has ${startCount} Start sections and ${endCount} End sections. ` +
    "It needs exactly 1 Start and at least 1 End."
  );
}
