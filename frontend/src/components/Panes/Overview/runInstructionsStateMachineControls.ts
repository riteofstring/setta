import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { type ZustandProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";

export type RunInstructionsStateMachineControl = {
  sectionId: string;
  label: string;
  machineGroupId: string;
};

export function collectRunInstructionsStateMachineControls(
  state: ZustandProjectState,
): Array<RunInstructionsStateMachineControl> {
  const controls: Array<RunInstructionsStateMachineControl> = [];
  for (const sectionId of Object.keys(state.projectConfig.topLevelSections)) {
    if (!(sectionId in state.sections)) {
      throw new Error(
        `Top-level section ${sectionId} is missing from project state.`,
      );
    }
    const section = state.sections[sectionId];
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (impl.type !== SectionTypeEnum.StateMachineStart) {
      continue;
    }
    const machineGroupId = impl.machineGroupId.trim();
    if (machineGroupId === "") {
      continue;
    }
    const label = impl.label.trim() !== "" ? impl.label.trim() : section.name;
    controls.push({
      sectionId,
      label,
      machineGroupId,
    });
  }
  controls.sort((left, right) => {
    const byLabel = left.label.localeCompare(right.label);
    if (byLabel !== 0) {
      return byLabel;
    }
    const byMachineGroupId = left.machineGroupId.localeCompare(
      right.machineGroupId,
    );
    if (byMachineGroupId !== 0) {
      return byMachineGroupId;
    }
    return left.sectionId.localeCompare(right.sectionId);
  });
  return controls;
}
